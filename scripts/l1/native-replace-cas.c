// Personal macOS expected-SHA existing-file replacement. Never creates a missing target.
// Safe Replace v2 holds flock-style exclusive locks on both the original and staged
// inodes, then uses Darwin renameatx_np(RENAME_SWAP) so the displaced target remains
// recoverable until post-swap identity/content/metadata validation succeeds.
// Raw same-UID writers can ignore advisory locks, so a detected race is atomically
// rolled back when safe; uncertainty is fail-closed and never retryable.
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
// This compares an observed metadata snapshot; it is NOT an atomic compare
// with a later rename. ctime detects metadata-only edits including mode/xattrs.
static int same_metadata(const struct stat *a,const struct stat *b){
 return a->st_mode==b->st_mode&&a->st_flags==b->st_flags&&
        a->st_ctimespec.tv_sec==b->st_ctimespec.tv_sec&&
        a->st_ctimespec.tv_nsec==b->st_ctimespec.tv_nsec;
}
static int same_identity(const struct stat *a,const struct stat *b){
 return a->st_dev==b->st_dev&&a->st_ino==b->st_ino;
}
// rename swap changes ctime on APFS. Compare the semantic fields that the swap
// itself does not change; xattrs are checked separately against the staged inode.
static int same_postswap_metadata(const struct stat *a,const struct stat *b){
 return a->st_mode==b->st_mode&&a->st_flags==b->st_flags&&
        a->st_uid==b->st_uid&&a->st_gid==b->st_gid&&
        a->st_nlink==b->st_nlink&&a->st_size==b->st_size&&
        a->st_mtimespec.tv_sec==b->st_mtimespec.tv_sec&&
        a->st_mtimespec.tv_nsec==b->st_mtimespec.tv_nsec;
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
    after.st_mtimespec.tv_nsec!=before->st_mtimespec.tv_nsec||
    !same_metadata(before,&after))
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
// After a successful RENAME_SWAP, restore the exact directory entries only if
// our staged inode still owns the public leaf and the displaced entry still owns
// the private stage. This preserves an intervening external writer instead of
// silently overwriting it. Any ambiguity is non-retryable uncertainty.
static void rollback_swap(int parent,const char *stage,const char *leaf,
                          const struct stat *owned,const struct stat *displaced){
 struct stat leaf_now,stage_now;
 if(fstatat(parent,leaf,&leaf_now,AT_SYMLINK_NOFOLLOW)||
    fstatat(parent,stage,&stage_now,AT_SYMLINK_NOFOLLOW)||
    !same_identity(&leaf_now,owned)||!same_identity(&stage_now,displaced))
  fail("CAS_ROLLBACK_UNCERTAIN");
 if(renameatx_np(parent,stage,parent,leaf,RENAME_SWAP|RENAME_NOFOLLOW_ANY))
  fail("CAS_ROLLBACK_UNCERTAIN");
 struct stat leaf_restored,stage_restored;
 if(fstatat(parent,leaf,&leaf_restored,AT_SYMLINK_NOFOLLOW)||
    fstatat(parent,stage,&stage_restored,AT_SYMLINK_NOFOLLOW)||
    !same_identity(&leaf_restored,displaced)||!same_identity(&stage_restored,owned))
  fail("CAS_ROLLBACK_UNCERTAIN");
 if(unlinkat(parent,stage,0)||fsync(parent))fail("CAS_ROLLBACK_UNCERTAIN");
 fail("CAS_TARGET_CHANGED");
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
// Compare the complete bounded original xattr set with what was copied to
// the staged inode. A list-size match is not sufficient: values can change
// while content SHA stays identical. Refuse (do not guess) on any read error.
static int same_xattrs(int from,int to){
 ssize_t alen=flistxattr(from,NULL,0,0),blen=flistxattr(to,NULL,0,0);
 if(alen<0||blen<0||alen>32768||blen>32768||alen!=blen)return 0;
 if(!alen)return 1;
 char *names=malloc((size_t)alen);
 if(!names)return 0;
 int equal=0;
 if(flistxattr(from,names,(size_t)alen,0)!=alen)goto done;
 size_t off=0;
 while(off<(size_t)alen){
  const char *name=names+off;
  size_t left=(size_t)alen-off,n=strnlen(name,left);
  if(!n||n==left)goto done;
  ssize_t size=fgetxattr(from,name,NULL,0,0,0);
  if(size<0||size>1048576||fgetxattr(to,name,NULL,0,0,0)!=size)goto done;
  void *a=malloc(size?(size_t)size:1),*b=malloc(size?(size_t)size:1);
  if(!a||!b){free(a);free(b);goto done;}
  ssize_t ar=fgetxattr(from,name,a,(size_t)size,0,0);
  ssize_t br=fgetxattr(to,name,b,(size_t)size,0,0);
  int match=ar==size&&br==size&&!memcmp(a,b,(size_t)size);
  free(a);free(b);
  if(!match)goto done;
  off+=n+1;
 }
 equal=1;
done:
 free(names);return equal;
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
 unsigned char incoming_digest[CC_SHA256_DIGEST_LENGTH];
 CC_SHA256(incoming,(CC_LONG)length,incoming_digest);
 char leaf[PATH_MAX];int parent=parent_fd(argv[1],leaf);
 int original=openat(parent,leaf,O_RDONLY|O_NOFOLLOW|O_CLOEXEC|O_EXLOCK);
 if(original<0){
  int saved=errno;
  if(saved==ENOENT)fail("CAS_TARGET_MISSING");
  if(saved==ENOTSUP||saved==EOPNOTSUPP)fail("CAS_LOCK_UNSUPPORTED");
  fail("CAS_TARGET_UNSAFE");
 }
 // O_EXLOCK may wait while another cooperating helper commits. Revalidate the
 // path after the lock is actually acquired so a stale vnode is a conflict,
 // not misreported as an intrinsically unsafe target.
 struct stat opened,locked_leaf;
 if(fstat(original,&opened))fail("CAS_TARGET_UNSAFE");
 if(fstatat(parent,leaf,&locked_leaf,AT_SYMLINK_NOFOLLOW)||
    !same_identity(&opened,&locked_leaf))fail("CAS_TARGET_CHANGED");
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
  temp=openat(parent,stage,O_RDWR|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC|O_EXLOCK,0600);
  if(temp>=0)break;
  if(errno==ENOTSUP||errno==EOPNOTSUPP)fail("CAS_LOCK_UNSUPPORTED");
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
 // Test-only deterministic metadata drift after the staged snapshot. The
 // normal pinned production binary has none of these compile-time branches.
#if defined(PERSONAL_TEST_CAS_MODE_DRIFT)
 if(fchmod(original,(before.st_mode&0777)^0100))fail("CAS_TEST_SETUP_FAILED");
#elif defined(PERSONAL_TEST_CAS_XATTR_DRIFT)
 if(fsetxattr(original,"com.example.chatagent.f03","CHANGED",7,0,0))
  fail("CAS_TEST_SETUP_FAILED");
#elif defined(PERSONAL_TEST_CAS_STAGE_XATTR_DRIFT)
 int testfd=openat(parent,stage,O_WRONLY|O_NOFOLLOW|O_CLOEXEC);
 if(testfd<0||fsetxattr(testfd,"com.example.chatagent.f03","STAGE",5,0,0))
  fail("CAS_TEST_SETUP_FAILED");
 close_ok(testfd);
#endif
 // A substituted leaf or content edit before this check MUST NOT be replaced.
 // A malicious same-UID writer between this check and rename is not excluded.
 struct stat now;
 if(fstatat(parent,leaf,&now,AT_SYMLINK_NOFOLLOW)||!S_ISREG(now.st_mode)||
    now.st_nlink!=1||now.st_uid!=geteuid()||
    now.st_dev!=before.st_dev||now.st_ino!=before.st_ino||
    now.st_size!=before.st_size||
    now.st_mtimespec.tv_sec!=before.st_mtimespec.tv_sec||
    now.st_mtimespec.tv_nsec!=before.st_mtimespec.tv_nsec||
    !same_metadata(&before,&now))
  clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 unsigned char final[CC_SHA256_DIGEST_LENGTH];struct stat verify;
 if(!hash_file(original,&verify,final))clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 if(!metadata_supported(original,&verify))
  clean_stage(parent,stage,&owned,"CAS_METADATA_UNSUPPORTED");
 if(!same_sha(final,argv[2])||verify.st_ino!=before.st_ino||
    verify.st_dev!=before.st_dev)
  clean_stage(parent,stage,&owned,"CAS_PRECONDITION_MISMATCH");
 struct stat staged_now;
 if(fstat(temp,&staged_now)||!same_identity(&staged_now,&owned)||
    staged_now.st_nlink!=1||!same_metadata(&before,&verify)||
    !same_xattrs(original,temp))
  clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 // A newly created stage can inherit an extended ACL from its parent directory
 // even when the original target itself has no ACL. Extended ACLs are outside
 // this replace contract, so refuse before the swap rather than silently adding
 // permissions to the replacement file.
 if(!metadata_supported(temp,&staged_now))
  clean_stage(parent,stage,&owned,"CAS_METADATA_UNSUPPORTED");
 if(fstatat(parent,leaf,&now,AT_SYMLINK_NOFOLLOW)||!same_identity(&now,&before)||
    now.st_nlink!=1||!same_metadata(&before,&now))
  clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
 // Fixture-only races occur AFTER the last pre-swap check. Production builds
 // define neither macro. They exercise the exact historical F03 window.
#if defined(PERSONAL_TEST_CAS_PATH_RACE)
 {
  const char *race=".personal-cas-race-window";
  int r=openat(parent,race,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
  if(r<0||write(r,"RACE_WINDOW",11)!=11||fsync(r)||close(r)||
     renameat(parent,race,parent,leaf))fail("CAS_TEST_SETUP_FAILED");
 }
#elif defined(PERSONAL_TEST_CAS_CONTENT_RACE)
 {
  int r=openat(parent,leaf,O_WRONLY|O_NOFOLLOW|O_CLOEXEC);
  if(r<0||ftruncate(r,0)||write(r,"RACE_WINDOW",11)!=11||fsync(r)||close(r))
   fail("CAS_TEST_SETUP_FAILED");
 }
#endif
 if(renameatx_np(parent,stage,parent,leaf,RENAME_SWAP|RENAME_NOFOLLOW_ANY)){
  int saved=errno;
  if(saved==ENOENT||saved==ELOOP)
   clean_stage(parent,stage,&owned,"CAS_TARGET_CHANGED");
  if(saved==ENOTSUP)clean_stage(parent,stage,&owned,"CAS_SWAP_UNSUPPORTED");
  clean_stage(parent,stage,&owned,"CAS_SWAP_FAILED");
 }
#if defined(PERSONAL_TEST_CAS_POSTSWAP_PATH_RACE)
 {
  const char *race=".personal-cas-postswap-race";
  int r=openat(parent,race,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
  if(r<0||write(r,"POSTSWAP_RACE",13)!=13||fsync(r)||close(r)||
     renameat(parent,race,parent,leaf))fail("CAS_TEST_SETUP_FAILED");
 }
#elif defined(PERSONAL_TEST_CAS_POSTSWAP_CONTENT_RACE)
 {
  int r=openat(parent,leaf,O_WRONLY|O_NOFOLLOW|O_CLOEXEC);
  if(r<0||ftruncate(r,0)||write(r,"POSTSWAP_MUTATED",16)!=16||fsync(r)||close(r))
   fail("CAS_TEST_SETUP_FAILED");
 }
#endif
 // Both old and new inodes remain exclusively locked by this process across
 // the swap. The old directory entry is retained at `stage` until verification.
 struct stat committed_path,displaced;
 if(fstatat(parent,leaf,&committed_path,AT_SYMLINK_NOFOLLOW)||
    fstatat(parent,stage,&displaced,AT_SYMLINK_NOFOLLOW))
  fail("CAS_ROLLBACK_UNCERTAIN");
 if(!same_identity(&committed_path,&owned))fail("CAS_ROLLBACK_UNCERTAIN");
 if(!same_identity(&displaced,&before))
  rollback_swap(parent,stage,leaf,&owned,&displaced);
 unsigned char post_digest[CC_SHA256_DIGEST_LENGTH];struct stat post;
 if(!hash_file(original,&post,post_digest)||!same_identity(&post,&before)||
    !same_sha(post_digest,argv[2])||!same_postswap_metadata(&before,&post)||
    !metadata_supported(original,&post)||!same_xattrs(original,temp))
  rollback_swap(parent,stage,leaf,&owned,&displaced);
 // Validate the committed NEW inode too. A raw writer can ignore O_EXLOCK; if it
 // mutates our new inode after the swap, restore the displaced original before
 // discarding it. This keeps the old data recoverable until both sides validate.
 unsigned char committed_digest[CC_SHA256_DIGEST_LENGTH];struct stat committed_post;
 if(!hash_file(temp,&committed_post,committed_digest)||
    !same_identity(&committed_post,&owned)||
    memcmp(committed_digest,incoming_digest,CC_SHA256_DIGEST_LENGTH)||
    !same_postswap_metadata(&staged_now,&committed_post)||
    !metadata_supported(temp,&committed_post))
  rollback_swap(parent,stage,leaf,&owned,&displaced);
 struct stat committed_fd,committed_again,displaced_again;
 if(fstat(temp,&committed_fd)||!same_identity(&committed_fd,&owned)||
    fstatat(parent,leaf,&committed_again,AT_SYMLINK_NOFOLLOW)||
    fstatat(parent,stage,&displaced_again,AT_SYMLINK_NOFOLLOW)||
    !same_identity(&committed_again,&owned)||!same_identity(&displaced_again,&before))
  fail("CAS_ROLLBACK_UNCERTAIN");
 // Make the recoverable two-name swap durable before discarding the old inode.
 if(fsync(parent))fail("CAS_COMMIT_UNCERTAIN");
 if(unlinkat(parent,stage,0))fail("CAS_POSTCOMMIT_UNCERTAIN");
 if(fsync(parent))fail("CAS_POSTCOMMIT_UNCERTAIN");
 close_ok(temp);close_ok(original);close_ok(parent);
 printf("CAS_DONE bytes=%llu\n",(unsigned long long)length);
 return 0;
}
