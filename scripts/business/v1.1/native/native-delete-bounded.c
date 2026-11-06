// ChatAgent Business v1.1 bounded delete primitive.
// Regular-file deletion requires exact SHA-256. Empty-directory deletion is non-recursive.
// The target is first moved to a random sibling name with RENAME_EXCL, identity-checked,
// then unlinked/rmdir'd so a path-substitution race does not silently delete a replacement.
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
static void close_ok(int fd){if(fd>=0&&close(fd))fail("DELETE_CLOSE_UNCERTAIN");}
static int same_identity(const struct stat *a,const struct stat *b){return a->st_dev==b->st_dev&&a->st_ino==b->st_ino;}
static int valid_sha(const char *s){
 if(!s||strlen(s)!=64)return 0;
 for(size_t i=0;i<64;i++)if(!((s[i]>='0'&&s[i]<='9')||(s[i]>='a'&&s[i]<='f')))return 0;
 return 1;
}
static int parent_fd(const char *full,char *leaf){
 if(!full||full[0]!='/'||strlen(full)>=PATH_MAX)fail("DELETE_INVALID_PATH");
 char copy[PATH_MAX];strcpy(copy,full);
 char *save=NULL,*part=strtok_r(copy,"/",&save);
 if(!part)fail("DELETE_INVALID_PATH");
 int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 if(fd<0)fail("DELETE_PARENT_UNSAFE");
 while(part){
  if(!strcmp(part,".")||!strcmp(part,".."))fail("DELETE_TRAVERSAL_DENIED");
  char *next=strtok_r(NULL,"/",&save);
  if(!next){strcpy(leaf,part);return fd;}
  int child=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(child<0)fail("DELETE_PARENT_UNSAFE");
  close_ok(fd);fd=child;part=next;
 }
 fail("DELETE_INVALID_PATH");return -1;
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
 static const char *digits="0123456789abcdef";unsigned diff=0;
 for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++){
  diff|=(unsigned)(digits[digest[i]>>4]!=hex[i*2]);
  diff|=(unsigned)(digits[digest[i]&15]!=hex[i*2+1]);
 }
 return diff==0;
}
static void random_stage(char stage[80]){
 unsigned char entropy[16];arc4random_buf(entropy,sizeof(entropy));
 static const char *hex="0123456789abcdef";
 strcpy(stage,".chatagent-delete-");
 size_t at=strlen(stage);
 for(int i=0;i<16;i++){stage[at+i*2]=hex[entropy[i]>>4];stage[at+i*2+1]=hex[entropy[i]&15];}
 stage[at+32]='\0';
}
static void restore_or_uncertain(int parent,const char *stage,const char *leaf,const struct stat *expected,const char *reason){
 struct stat staged;
 if(fstatat(parent,stage,&staged,AT_SYMLINK_NOFOLLOW)||!same_identity(&staged,expected))fail("DELETE_RECOVERY_UNCERTAIN");
 struct stat leafNow;
 if(fstatat(parent,leaf,&leafNow,AT_SYMLINK_NOFOLLOW)==0)fail("DELETE_RECOVERY_UNCERTAIN");
 if(errno!=ENOENT)fail("DELETE_RECOVERY_UNCERTAIN");
 if(renameatx_np(parent,stage,parent,leaf,RENAME_EXCL|RENAME_NOFOLLOW_ANY))fail("DELETE_RECOVERY_UNCERTAIN");
 if(fsync(parent))fail("DELETE_RECOVERY_UNCERTAIN");
 fail(reason);
}
int main(int argc,char **argv){
 if(argc!=4)fail("DELETE_INPUT_INVALID");
 const char *target=argv[1],*kind=argv[2],*expectedSha=argv[3];
 int fileMode=!strcmp(kind,"regular_file"),dirMode=!strcmp(kind,"empty_directory");
 if(!fileMode&&!dirMode)fail("DELETE_INPUT_INVALID");
 if(fileMode&&!valid_sha(expectedSha))fail("DELETE_PRECONDITION_REQUIRED");
 if(dirMode&&strcmp(expectedSha,"-"))fail("DELETE_INPUT_INVALID");
 char leaf[PATH_MAX];int parent=parent_fd(target,leaf);
 struct stat before;
 if(fstatat(parent,leaf,&before,AT_SYMLINK_NOFOLLOW)){
  if(errno==ENOENT)fail("DELETE_TARGET_MISSING");
  fail("DELETE_TARGET_UNSAFE");
 }
 if(S_ISLNK(before.st_mode))fail("DELETE_TARGET_UNSUPPORTED");
 int opened=-1;
 if(fileMode){
  if(!S_ISREG(before.st_mode))fail("DELETE_KIND_MISMATCH");
  opened=openat(parent,leaf,O_RDONLY|O_NOFOLLOW|O_CLOEXEC|O_EXLOCK);
  if(opened<0)fail("DELETE_TARGET_CHANGED");
  struct stat locked;
  if(fstat(opened,&locked)||!same_identity(&before,&locked))fail("DELETE_TARGET_CHANGED");
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  if(!hash_fd(opened,&locked,digest))fail("DELETE_TARGET_CHANGED");
  if(!sha_matches(digest,expectedSha))fail("DELETE_PRECONDITION_MISMATCH");
  struct stat pathNow;
  if(fstatat(parent,leaf,&pathNow,AT_SYMLINK_NOFOLLOW)||!same_identity(&locked,&pathNow))fail("DELETE_TARGET_CHANGED");
  before=locked;
 }else if(!S_ISDIR(before.st_mode))fail("DELETE_KIND_MISMATCH");
 char stage[80];int moved=0;
 for(int attempt=0;attempt<8&&!moved;attempt++){
  random_stage(stage);
  if(!renameatx_np(parent,leaf,parent,stage,RENAME_EXCL|RENAME_NOFOLLOW_ANY)){moved=1;break;}
  if(errno==EEXIST)continue;
  if(errno==ENOENT||errno==ELOOP)fail("DELETE_TARGET_CHANGED");
  fail("DELETE_STAGE_FAILED");
 }
 if(!moved)fail("DELETE_STAGE_FAILED");
 struct stat staged;
 if(fstatat(parent,stage,&staged,AT_SYMLINK_NOFOLLOW)||!same_identity(&before,&staged))
  restore_or_uncertain(parent,stage,leaf,&before,"DELETE_TARGET_CHANGED");
 if(fsync(parent))restore_or_uncertain(parent,stage,leaf,&before,"DELETE_STAGE_UNCERTAIN");
 struct stat finalCheck;
 if(fstatat(parent,stage,&finalCheck,AT_SYMLINK_NOFOLLOW)||!same_identity(&before,&finalCheck))
  fail("DELETE_POSTSTAGE_UNCERTAIN");
 int flags=dirMode?AT_REMOVEDIR:0;
 if(unlinkat(parent,stage,flags)){
  int saved=errno;
  if(dirMode&&(saved==ENOTEMPTY||saved==EEXIST))restore_or_uncertain(parent,stage,leaf,&before,"DELETE_DIRECTORY_NOT_EMPTY");
  restore_or_uncertain(parent,stage,leaf,&before,"DELETE_COMMIT_FAILED");
 }
 if(fsync(parent))fail("DELETE_POSTCOMMIT_UNCERTAIN");
 printf("DELETE_DONE dev=%llu ino=%llu kind=%s\n",(unsigned long long)before.st_dev,(unsigned long long)before.st_ino,kind);
 close_ok(opened);close_ok(parent);return 0;
}
