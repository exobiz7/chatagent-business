// ChatAgent Personal v1.1 macOS Keychain secret helper.
// Secret bytes are accepted on stdin and returned on stdout only.
// Secrets are never accepted through argv or environment variables.
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { MAX_SECRET_BYTES = 16384, MAX_LABEL_BYTES = 255 };

static void fail(const char *code) {
  fprintf(stderr, "%s\n", code);
  exit(2);
}

static int valid_label(const char *s) {
  if (!s) return 0;
  size_t n = strlen(s);
  if (n < 1 || n > MAX_LABEL_BYTES) return 0;
  for (size_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)s[i];
    if (c < 0x20 || c == 0x7f) return 0;
  }
  return 1;
}

static CFStringRef cf_string(const char *s) {
  CFStringRef out = CFStringCreateWithCString(kCFAllocatorDefault, s, kCFStringEncodingUTF8);
  if (!out) fail("KEYCHAIN_INVALID_LABEL");
  return out;
}

static CFMutableDictionaryRef base_query(const char *service, const char *account) {
  CFMutableDictionaryRef q = CFDictionaryCreateMutable(
    kCFAllocatorDefault, 0,
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  );
  if (!q) fail("KEYCHAIN_ALLOC_FAILED");

  CFStringRef svc = cf_string(service);
  CFStringRef acc = cf_string(account);
  CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
  CFDictionarySetValue(q, kSecAttrService, svc);
  CFDictionarySetValue(q, kSecAttrAccount, acc);
  CFRelease(svc);
  CFRelease(acc);
  return q;
}

static size_t read_secret(unsigned char *buffer) {
  size_t length = 0;
  while (length <= MAX_SECRET_BYTES) {
    ssize_t n = read(STDIN_FILENO, buffer + length, (MAX_SECRET_BYTES + 1) - length);
    if (n < 0) {
      if (errno == EINTR) continue;
      fail("KEYCHAIN_INPUT_FAILED");
    }
    if (n == 0) break;
    length += (size_t)n;
  }
  if (length < 1) fail("KEYCHAIN_EMPTY_SECRET");
  if (length > MAX_SECRET_BYTES) fail("KEYCHAIN_SECRET_LIMIT");
  return length;
}

static void write_all(const unsigned char *buffer, size_t length) {
  size_t offset = 0;
  while (offset < length) {
    ssize_t n = write(STDOUT_FILENO, buffer + offset, length - offset);
    if (n < 0) {
      if (errno == EINTR) continue;
      fail("KEYCHAIN_OUTPUT_FAILED");
    }
    if (n == 0) fail("KEYCHAIN_OUTPUT_FAILED");
    offset += (size_t)n;
  }
}

static int command_write(const char *service, const char *account) {
  unsigned char buffer[MAX_SECRET_BYTES + 1];
  size_t length = read_secret(buffer);
  CFDataRef data = CFDataCreate(kCFAllocatorDefault, buffer, (CFIndex)length);
  memset(buffer, 0, sizeof(buffer));
  if (!data) fail("KEYCHAIN_ALLOC_FAILED");

  CFMutableDictionaryRef add = base_query(service, account);
  CFDictionarySetValue(add, kSecValueData, data);
  OSStatus status = SecItemAdd(add, NULL);

  if (status == errSecDuplicateItem) {
    CFMutableDictionaryRef match = base_query(service, account);
    CFMutableDictionaryRef update = CFDictionaryCreateMutable(
      kCFAllocatorDefault, 0,
      &kCFTypeDictionaryKeyCallBacks,
      &kCFTypeDictionaryValueCallBacks
    );
    if (!update) {
      CFRelease(match); CFRelease(add); CFRelease(data);
      fail("KEYCHAIN_ALLOC_FAILED");
    }
    CFDictionarySetValue(update, kSecValueData, data);
    status = SecItemUpdate(match, update);
    CFRelease(update);
    CFRelease(match);
  }

  CFRelease(add);
  CFRelease(data);
  if (status != errSecSuccess) fail("KEYCHAIN_WRITE_FAILED");
  return 0;
}

static int command_read(const char *service, const char *account) {
  CFMutableDictionaryRef q = base_query(service, account);
  CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
  CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);

  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching(q, &result);
  CFRelease(q);

  if (status == errSecItemNotFound) fail("KEYCHAIN_NOT_FOUND");
  if (status != errSecSuccess || !result || CFGetTypeID(result) != CFDataGetTypeID()) {
    if (result) CFRelease(result);
    fail("KEYCHAIN_READ_FAILED");
  }

  CFDataRef data = (CFDataRef)result;
  CFIndex length = CFDataGetLength(data);
  if (length < 1 || length > MAX_SECRET_BYTES) {
    CFRelease(result);
    fail("KEYCHAIN_SECRET_INVALID");
  }
  write_all(CFDataGetBytePtr(data), (size_t)length);
  CFRelease(result);
  return 0;
}

static int command_delete(const char *service, const char *account) {
  CFMutableDictionaryRef q = base_query(service, account);
  OSStatus status = SecItemDelete(q);
  CFRelease(q);
  if (status == errSecItemNotFound) fail("KEYCHAIN_NOT_FOUND");
  if (status != errSecSuccess) fail("KEYCHAIN_DELETE_FAILED");
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 4 || !valid_label(argv[2]) || !valid_label(argv[3]))
    fail("KEYCHAIN_INVALID_INPUT");

  if (!strcmp(argv[1], "write")) return command_write(argv[2], argv[3]);
  if (!strcmp(argv[1], "read")) return command_read(argv[2], argv[3]);
  if (!strcmp(argv[1], "delete")) return command_delete(argv[2], argv[3]);
  fail("KEYCHAIN_INVALID_OPERATION");
  return 2;
}
