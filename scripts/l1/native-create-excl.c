// STABLE-001 macOS native create-only primitive; development candidate.
// No arbitrary delete, overwrite or replace. Input bytes are read from stdin.
#define _DARWIN_C_SOURCE 1
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

enum { CHATAGENT_MAX_BYTES = 262144 };

static void die(const char *code) {
  fprintf(stderr,"%s\n",code);
  exit(2);
}
static void close_checked(int fd) {
  if (close(fd) != 0) die("NATIVE_CLOSE_FAILED");
}
int main(int argc, char **argv) {
  if (argc!=2 || !argv[1] || argv[1][0]!='/' || strlen(argv[1])>=PATH_MAX)
    die("NATIVE_INVALID_PATH");
  unsigned char buffer[CHATAGENT_MAX_BYTES+1];
  size_t length=0;
  while (length<=CHATAGENT_MAX_BYTES) {
    ssize_t n=read(STDIN_FILENO,buffer+length,(CHATAGENT_MAX_BYTES+1)-length);
    if(n<0){if(errno==EINTR)continue;die("NATIVE_INPUT_FAILED");}
    if(!n)break;
    length+=(size_t)n;
  }
  if(length>CHATAGENT_MAX_BYTES)die("NATIVE_INPUT_LIMIT");

  char path[PATH_MAX];
  memcpy(path,argv[1],strlen(argv[1])+1);
  char *save=NULL,*name=strtok_r(path,"/",&save);
  if(!name)die("NATIVE_NO_LEAF");
  int parent=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
  if(parent<0)die("NATIVE_ROOT_FAILED");
  while(name) {
    if(!strcmp(name,".")||!strcmp(name,".."))die("NATIVE_TRAVERSAL_DENIED");
    char *next=strtok_r(NULL,"/",&save);
    if(!next)break;
    int nextfd=openat(parent,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
    if(nextfd<0){
      fprintf(stderr,"%s\n",errno==ELOOP||errno==ENOTDIR?"NATIVE_SYMLINK_OR_PARENT_DENIED":
        "NATIVE_PARENT_FAILED");
      return 2;
    }
    close_checked(parent);parent=nextfd;name=next;
  }
  int fd=openat(parent,name,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
  if(fd<0){
    fprintf(stderr,"%s\n",errno==EEXIST?"NATIVE_DESTINATION_EXISTS":
      errno==ELOOP?"NATIVE_LEAF_SYMLINK":"NATIVE_CREATE_FAILED");
    return 2;
  }
  size_t offset=0;
  while(offset<length){
    ssize_t n=write(fd,buffer+offset,length-offset);
    if(n<0){if(errno==EINTR)continue;die("NATIVE_WRITE_UNCERTAIN");}
    if(n==0)die("NATIVE_WRITE_UNCERTAIN");
    offset+=(size_t)n;
  }
  if(fsync(fd)!=0)die("NATIVE_FSYNC_UNCERTAIN");
  struct stat file;
  if(fstat(fd,&file)!=0||!S_ISREG(file.st_mode)||file.st_nlink!=1||
     file.st_size!=(off_t)length)die("NATIVE_IDENTITY_UNCERTAIN");
  close_checked(fd);
  if(fsync(parent)!=0)die("NATIVE_DIR_FSYNC_UNCERTAIN");
  close_checked(parent);
  printf("OK dev=%llu ino=%llu bytes=%llu\n",
    (unsigned long long)file.st_dev,
    (unsigned long long)file.st_ino,
    (unsigned long long)length);
  return 0;
}
