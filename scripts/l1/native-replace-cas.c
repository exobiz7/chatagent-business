// Personal macOS expected-SHA existing-file replacement. Never creates a missing target.
 // Same-directory rename provides atomic visibility, not a kernel-atomic hash compare
 // against hostile same-UID concurrent writers. No broad locks, privileged execution
 // or arbitrary deletion. Input bytes are read only from stdin.
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
#include <CommonCrypto/CommonDigest.h>
#include <sys/acl.h>
#include <sys/xattr.h>
enum { MAX_NEW = 262144, MAX_OLD = 16*1024*1024 };
static void fail(const char *code){fprintf(stderr,"%s\n",code);exit(2);}
static void close_ok(int fd){if(close(fd))fail("CAS_CLOSE_UNCERTAIN");}
static int parent_fd(const char *full,char *leaf){
 if(!full||full[0]!='/'||strlen(full)>=PATH_MAX)fail("CAS_INVALID_PATH");
 char copy[PATH_MAX];strcpy(copy,full);
 char *save=NULL,*part=strtok_r(copy,"/",&save);
 if(!part)fail("CAS_INVALID_PATH");
 int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 if(fd<0)fail("CAS_PARENT_UNSAFE");
 while(part){
  if(!strcmp(part,".")||!strcmp(part,".."))fail("CAS_TRAVERSAL_DENIED");
  char *next=strtok_r(NULL,"/",&save);
  if(!next){strcpy(leaf,part);return fd;}
  int child=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(child<0)fail("CAS_PARENT_UNSAFE");
  close_ok(fd);fd=child;part=next;
 }
 fail("CAS_INVALID_PATH");return -1;
}
static int hash_file(int fd,struct stat *before,unsigned char digest[CC_SHA256_DIGEST_LENGTH]){
 if(fstat(fd,before)||!S_ISREG(before->st_mode)||before->st_nlink!=1||
    before->st_uid!=geteuid()||before->st_size<0||before->st_size>MAX_OLD)
  return 0;
 size_t size=(size_t)before->st_size;
 unsigned char *buf=malloc(size?size:1);
 if(!buf)return 0;
 size_t at=0;
 while(at<size){
  ssize_t n=pread(fd,buf+at,size-at,(off_t)at);
  if(n<0&&errno==EINTR)continue;
  if(n<=0){free(buf);return 0;}
  at+=(size_t)n;
 }
 CC_SHA256(buf,(CC_LONG)size,digest);free(buf);
 struct stat after;
 if(fstat(fd,&after)||after.st_dev!=before->st_dev||after.st_ino!=before->st_ino||
    after.st_size!=before->st_size||after.st_mtimespec.tv_sec!=before->st_mtimespec.tv_sec||
    after.st_mtimespec.tv_nsec!=before->st_mtimespec.tv_nsec)
  return 0;
 return 1;
}
static int same_sha(const unsigned char *digest,const char *hex){
 const char *digits="0123456789abcdef";
 unsigned diff=0;
 for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++){
  diff|=(unsigned)(digits[digest[i]>>4]!=hex[2*i]);
  diff|=(unsigned)(digits[digest[i]&15]!=hex[2*i+1]);
 }
 return diff==0;
}
static void clean_stage(int parent,const char *stage,const struct stat *owned,
                        const char *reason){
 struct stat now;
 if(fstatat(parent,stage,&now,AT_SYMLINK_NOFOLLOW)||!S_ISREG(now.st_mode)||
    now.st_dev!=owned->st_dev||now.st_ino!=owned->st_ino||now.st_nlink!=1||
    unlinkat(parent,stage,0))fail("CAS_STAGE_CLEANUP_UNCERTAIN");
 fail(reason);
}
// ACLs and file flags are not safely transferable by this candidate.
// Refuse BEFORE the replacement effect instead of silently dropping them.
static int metadata_supported(int fd,const struct stat *st){
 if(st->st_flags!=0)return 0;
 errno=0;
 acl_t acl=acl_get_fd_np(fd,ACL_TYPE_EXTENDED);
 if(acl){acl_free(acl);return 0;}
 return errno==ENOENT;
}
// Preserve the macOS xattrs (including provenance) on the private staged inode.
// Refuse and clean ONLY that exact stage if an attribute cannot be copied.
static void preserve_xattrs(int from,int to,int parent,const char *stage,
                            const struct stat *owned){
 ssize_t len=flistxattr(from,NULL,0,0);
 if(len<0||len>32768)clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");
 if(!len)return;
 char *names=malloc((size_t)len);
 if(!names)clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");
 if(flistxattr(from,names,(size_t)len,0)!=len){
  free(names);clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");
 }
 size_t offset=0;
 while(offset<(size_t)len){
  const char *name=names+offset;
  size_t left=(size_t)len-offset,n=strnlen(name,left);
  if(!n||n==left){free(names);clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");}
  ssize_t size=fgetxattr(from,name,NULL,0,0,0);
  if(size<0||size>1048576){
   free(names);clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");
  }
  void *value=malloc(size?(size_t)size:1);
  if(!value){free(names);clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");}
  if(fgetxattr(from,name,value,(size_t)size,0,0)!=size||
     fsetxattr(to,name,value,(size_t)size,0,0)){
   free(value);free(names);clean_stage(parent,stage,owned,"CAS_METADATA_UNSUPPORTED");
  }
  free(value);offset+=n+1;
 }
 free(names);
}
int main(int argc,char **argv){
 if(argc!=3||!argv[2]||strlen(argv[2])!=64)fail("CAS_INPUT_INVALID");
 for(size_t i=0;i<64;i++)
  if(!((argv[2][i]>='0'&&argv[2][i]<='9')||
       (argv[2][i]>='a'&&argv[2][i]<='f')))fail("CAS_INPUT_INVALID");
 unsigned char incoming[MAX_NEW+1];size_t length=0;
 while(length<=MAX_NEW){
  ssize_t n=read(STDIN_FILENO,incoming+length,(MAX_NEW+1)-length);
  if(n<0&&errno==EINTR)continue;
  if(n<0)fail("CAS_INPUT_FAILED");
  if(n==0)break;
  length+=(size_t)n;
 }
 if(length>MAX_NEW)fail("CAS_INPUT_LIMIT");
 char leaf[PATH_MAX];int parent=parent_fd(argv[1],leaf);
 int original=openat(parent,leaf,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
 if(original<0)fail(errno==ENOENT?"CAS_TARGET_MISSING":"CAS_TARGET_UNSAFE");
 struct stat before;unsigned char current[CC_SHA256_DIGEST_LENGTH];
 if(!hash_file(original,&before,current))fail("CAS_TARGET_UNSAFE");
 if(!same_sha(current,argv[2]))fail("CAS_PRECONDITION_MISMATCH");
 if(!metadata_supported(original,&before))fail("CAS_METADATA_UNSUPPORTED");
 // Preserve mode and copyable xattrs; unsupported ACLs/flags refuse.
 char stage[80];int temp=-1;
 for(int i=0;i<8;i++){
  unsigned char entropy[16];arc4random_buf(entropy,sizeof(entropy));
  const char *hex="0123456789abcdef";
  strcpy(stage,".personal-cas-");
  for(int j=0;j<16;j++){
   stage[14+j*2]=hex[entropy[j]>>4];
   stage[15+j*2]=hex[entropy[j]&15];
  }
  stage[46]='\0';
  temp=openat(parent,stage,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
  if(temp>=0)break;
  if(errno!=EEXIST)fail("CAS_STAGE_CREATE_FAILED");
 }
 if(temp<0)fail("CAS_STAGE_CREATE_FAILED");
 struct stat owned;
 if(fstat(temp,&owned))fail("CAS_STAGE_UNCERTAIN");
 if(fchmod(temp,before.st_mode&0777))clean_stage(parent,stage,&owned,"CAS_STAGE_MODE_FAILED");
 preserve_xattrs(original,temp,parent,stage,&owned);
 size_t written=0;
 while(written<length){
  ssize_t n=write(temp,incoming+written,length-written);
  if(n<0&&errno==EINTR)continue;
  if(n<=0)fail("CAS_STAGE_WRITE_UNCERTAIN");
  written+=(size_t)n;
 }
 if(fsync(temp))fail("CAS_STAGE_FSYNC_UNCERTAIN");
 close_ok(temp);
 // A substituted leaf or content edit before this check MUST NOT be replaced.
 // A malicious same-UID writer between this check and rename is not excluded.
 struct stat now;
 if(fstatat(parent,leaf,&now,AT_SYMLINK_NOFOLLOW)||!S_ISREG(now.st_mode)||
    now.st_nlink!=1||now.st_uid!=geteuid()||
    now.st_dev!=before.st_dev||now.st_ino!=before.st_ino||
    now.st_size!=before.st_size||
    now.st_mtimespec.tv_sec!=before.st_mtimespec.tv_sec||
    now.st_mtimespec.tv_nsec!=before.st_mtimespec.tv_nsec)
  clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 unsigned char final[CC_SHA256_DIGEST_LENGTH];struct stat verify;
 if(!hash_file(original,&verify,final))clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 if(!metadata_supported(original,&verify))
  clean_stage(parent,stage,&owned,"CAS_METADATA_UNSUPPORTED");
 if(!same_sha(final,argv[2])||verify.st_ino!=before.st_ino||
    verify.st_dev!=before.st_dev)
  clean_stage(parent,stage,&owned,"CAS_PRECONDITION_MISMATCH");
 if(fstatat(parent,leaf,&now,AT_SYMLINK_NOFOLLOW)||now.st_dev!=before.st_dev||
    now.st_ino!=before.st_ino||now.st_nlink!=1)
  clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 if(renameat(parent,stage,parent,leaf))
  clean_stage(parent,stage,&owned,"CAS_RENAME_FAILED");
 // Visibility committed: any subsequent uncertainty MUST NOT be retried.
 if(fsync(parent))fail("CAS_COMMIT_UNCERTAIN");
 close_ok(original);close_ok(parent);
 printf("CAS_DONE bytes=%llu\n",(unsigned long long)length);
 return 0;
}
