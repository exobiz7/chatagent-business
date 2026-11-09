// ChatAgent Business v1.1 descriptor-bound move primitive for one project path.
// Darwin renameatx_np(RENAME_EXCL) provides atomic destination-no-overwrite semantics.
#define _DARWIN_C_SOURCE 1
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <CommonCrypto/CommonDigest.h>

static void fail(const char *code){fprintf(stderr,"%s\n",code);exit(2);}
static void close_ok(int fd){if(fd>=0&&close(fd))fail("MOVE_CLOSE_UNCERTAIN");}
static int same_identity(const struct stat *a,const struct stat *b){return a->st_dev==b->st_dev&&a->st_ino==b->st_ino;}
static int valid_sha(const char *s){
 if(!s||strlen(s)!=64)return 0;
 for(size_t i=0;i<64;i++)if(!((s[i]>='0'&&s[i]<='9')||(s[i]>='a'&&s[i]<='f')))return 0;
 return 1;
}
static int parent_fd(const char *full,char *leaf){
 if(!full||full[0]!='/'||strlen(full)>=PATH_MAX)fail("MOVE_INVALID_PATH");
 char copy[PATH_MAX];strcpy(copy,full);
 char *save=NULL,*part=strtok_r(copy,"/",&save);
 if(!part)fail("MOVE_INVALID_PATH");
 int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 if(fd<0)fail("MOVE_PARENT_UNSAFE");
 while(part){
  if(!strcmp(part,".")||!strcmp(part,".."))fail("MOVE_TRAVERSAL_DENIED");
  char *next=strtok_r(NULL,"/",&save);
  if(!next){strcpy(leaf,part);return fd;}
  int child=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(child<0)fail("MOVE_PARENT_UNSAFE");
  close_ok(fd);fd=child;part=next;
 }
 fail("MOVE_INVALID_PATH");return -1;
}
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
static int hash_fd(int fd,const struct stat *expected,unsigned char out[CC_SHA256_DIGEST_LENGTH]){
 CC_SHA256_CTX ctx;if(CC_SHA256_Init(&ctx)!=1)return 0;
 unsigned char buf[1024*1024];off_t at=0;
 for(;;){
  ssize_t n=pread(fd,buf,sizeof(buf),at);
  if(n<0&&errno==EINTR)continue;
  if(n<0)return 0;
  if(n==0)break;
  if(CC_SHA256_Update(&ctx,buf,(CC_LONG)n)!=1)return 0;
  at+=(off_t)n;
 }
 if(CC_SHA256_Final(out,&ctx)!=1)return 0;
 struct stat after;
 if(fstat(fd,&after)||!same_identity(expected,&after)||after.st_size!=expected->st_size||
    after.st_mtimespec.tv_sec!=expected->st_mtimespec.tv_sec||after.st_mtimespec.tv_nsec!=expected->st_mtimespec.tv_nsec||
    after.st_ctimespec.tv_sec!=expected->st_ctimespec.tv_sec||after.st_ctimespec.tv_nsec!=expected->st_ctimespec.tv_nsec)
  return 0;
 return 1;
}
#pragma clang diagnostic pop
static int sha_matches(const unsigned char digest[CC_SHA256_DIGEST_LENGTH],const char *hex){
 static const char *digits="0123456789abcdef";
 unsigned diff=0;
 for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++){
  diff|=(unsigned)(digits[digest[i]>>4]!=hex[i*2]);
  diff|=(unsigned)(digits[digest[i]&15]!=hex[i*2+1]);
 }
 return diff==0;
}
int main(int argc,char **argv){
 if(argc!=4)fail("MOVE_INPUT_INVALID");
 const char *srcPath=argv[1],*dstPath=argv[2],*expectedSha=argv[3];
 int hasSha=strcmp(expectedSha,"-")!=0;
 if(hasSha&&!valid_sha(expectedSha))fail("MOVE_INPUT_INVALID");
 char srcLeaf[PATH_MAX],dstLeaf[PATH_MAX];
 int srcParent=parent_fd(srcPath,srcLeaf),dstParent=parent_fd(dstPath,dstLeaf);
 struct stat before;
 if(fstatat(srcParent,srcLeaf,&before,AT_SYMLINK_NOFOLLOW)){
  if(errno==ENOENT)fail("MOVE_SOURCE_MISSING");
  fail("MOVE_SOURCE_UNSAFE");
 }
 if(S_ISLNK(before.st_mode)||(!S_ISREG(before.st_mode)&&!S_ISDIR(before.st_mode)))fail("MOVE_SOURCE_UNSUPPORTED");
 struct stat destination;
 if(fstatat(dstParent,dstLeaf,&destination,AT_SYMLINK_NOFOLLOW)==0)fail("MOVE_DESTINATION_EXISTS");
 if(errno!=ENOENT)fail("MOVE_DESTINATION_UNSAFE");
 int opened=-1;
 if(hasSha){
  if(!S_ISREG(before.st_mode))fail("MOVE_PRECONDITION_UNSUPPORTED");
  opened=openat(srcParent,srcLeaf,O_RDONLY|O_NOFOLLOW|O_CLOEXEC|O_EXLOCK);
  if(opened<0)fail("MOVE_SOURCE_CHANGED");
  struct stat locked;
  if(fstat(opened,&locked)||!same_identity(&before,&locked))fail("MOVE_SOURCE_CHANGED");
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  if(!hash_fd(opened,&locked,digest))fail("MOVE_SOURCE_CHANGED");
  if(!sha_matches(digest,expectedSha))fail("MOVE_PRECONDITION_MISMATCH");
  struct stat pathNow;
  if(fstatat(srcParent,srcLeaf,&pathNow,AT_SYMLINK_NOFOLLOW)||!same_identity(&locked,&pathNow))fail("MOVE_SOURCE_CHANGED");
  before=locked;
 }
 if(renameatx_np(srcParent,srcLeaf,dstParent,dstLeaf,RENAME_EXCL|RENAME_NOFOLLOW_ANY)){
  int saved=errno;
  if(saved==EEXIST)fail("MOVE_DESTINATION_EXISTS");
  if(saved==ENOENT||saved==ELOOP)fail("MOVE_SOURCE_CHANGED");
  if(saved==EXDEV)fail("MOVE_CROSS_DEVICE_DENIED");
  fail("MOVE_COMMIT_FAILED");
 }
 struct stat moved;
 if(fstatat(dstParent,dstLeaf,&moved,AT_SYMLINK_NOFOLLOW)||!same_identity(&before,&moved))
  fail("MOVE_POSTCOMMIT_UNCERTAIN");
 if(fsync(srcParent)||((srcParent!=dstParent)&&fsync(dstParent)))fail("MOVE_POSTCOMMIT_UNCERTAIN");
 const char *kind=S_ISREG(moved.st_mode)?"regular_file":"directory";
 printf("MOVE_DONE dev=%llu ino=%llu kind=%s\n",(unsigned long long)moved.st_dev,(unsigned long long)moved.st_ino,kind);
 close_ok(opened);close_ok(srcParent);if(dstParent!=srcParent)close_ok(dstParent);else dstParent=-1;
 return 0;
}
