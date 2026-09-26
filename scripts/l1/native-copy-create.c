// macOS-only CREATE-ONLY source-bound copy. No existing-target replace.
// Parent directories are opened component-by-component with O_NOFOLLOW.
// A destination entry is published only after full digest verification.
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
#include <signal.h>
#include <CommonCrypto/CommonDigest.h>
#define COPY_CHUNK (1024*1024)
#define MAX_COPY_BYTES (32LL*1024*1024*1024)
static volatile sig_atomic_t stopping=0;
static void on_stop(int signal_number){ (void)signal_number;stopping=1; }
static void fail(const char* code){fprintf(stderr,"%s\n",code);exit(2);}
static int open_parent(const char *full,char *leaf){
 if(!full||full[0]!='/'||strlen(full)>=PATH_MAX)fail("INVALID_COPY_PATH");
 char path[PATH_MAX];strcpy(path,full);
 char *save=NULL,*part=strtok_r(path,"/",&save);
 if(!part)fail("INVALID_COPY_LEAF");
 int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 if(fd<0)fail("COPY_ROOT_FAILED");
 while(part){
  if(!strcmp(part,".")||!strcmp(part,".."))fail("COPY_TRAVERSAL_DENIED");
  char *next=strtok_r(NULL,"/",&save);
  if(!next){strcpy(leaf,part);return fd;}
  int child=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(child<0)fail("COPY_PARENT_UNSAFE");
  close(fd);fd=child;part=next;
 }
 fail("INVALID_COPY_LEAF");return -1;
}
static void hex_digest(const unsigned char*d,char*out){
 for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++)sprintf(out+2*i,"%02x",d[i]);
 out[64]=0;
}
int main(int argc,char **argv){
 if(argc!=8)fail("INVALID_COPY_INPUT");
 const char *stageId=argv[7];
 if(strlen(stageId)!=36)fail("INVALID_COPY_STAGE_ID");
 for(int i=0;i<36;i++){
  char ch=stageId[i];
  if((i==8||i==13||i==18||i==23)?ch!='-':
     !((ch>='0'&&ch<='9')||(ch>='a'&&ch<='f')))
   fail("INVALID_COPY_STAGE_ID");
 }
 const char *expected=argv[3];
 if(strlen(expected)!=64)fail("INVALID_COPY_DIGEST");
 for(size_t i=0;i<64;i++)
  if(!((expected[i]>='0'&&expected[i]<='9')||(expected[i]>='a'&&expected[i]<='f')))
   fail("INVALID_COPY_DIGEST");
 char *tail=NULL;
 errno=0;unsigned long long size=strtoull(argv[4],&tail,10);
 if(errno||!tail||*tail||size>MAX_COPY_BYTES)fail("INVALID_COPY_SIZE");
 errno=0;unsigned long long expectedDev=strtoull(argv[5],&tail,10);
 if(errno||!tail||*tail)fail("INVALID_COPY_IDENTITY");
 errno=0;unsigned long long expectedIno=strtoull(argv[6],&tail,10);
 if(errno||!tail||*tail)fail("INVALID_COPY_IDENTITY");
 struct sigaction action={0};
 action.sa_handler=on_stop;sigemptyset(&action.sa_mask);
 sigaction(SIGTERM,&action,NULL);sigaction(SIGINT,&action,NULL);
 char srcleaf[PATH_MAX],dstleaf[PATH_MAX];
 int sparent=open_parent(argv[1],srcleaf);
 int src=openat(sparent,srcleaf,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
 if(src<0)fail("COPY_SOURCE_UNSAFE");
 struct stat first;
 if(fstat(src,&first)||!S_ISREG(first.st_mode)||first.st_size!=(off_t)size||
    (unsigned long long)first.st_dev!=expectedDev||
    (unsigned long long)first.st_ino!=expectedIno)
  fail("COPY_SOURCE_IDENTITY_MISMATCH");
 int dparent=open_parent(argv[2],dstleaf);
 // The final destination must not be a symlink or existing entry. linkat below
 // enforces the no-overwrite commit atomically; no pathname rename fallback.
 char stage[96];
 snprintf(stage,sizeof(stage),".personal-copy-%s.stage",stageId);
 int staged=openat(dparent,stage,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
 if(staged<0)fail("COPY_STAGE_FAILED");
 // Durable record owns the random stageId BEFORE launch. This event enables
 // a deterministic test-only SIGKILL of the helper without touching other jobs.
 printf("COPY_STAGE_READY id=%s\n",stageId);fflush(stdout);
#ifdef PERSONAL_TEST_STAGE_HOLD_MS
 // Compiled only into disposable test binaries, never the release helper.
 usleep(PERSONAL_TEST_STAGE_HOLD_MS * 1000);
#endif
 unsigned char *buf=malloc(COPY_CHUNK);
 if(!buf){unlinkat(dparent,stage,0);fail("COPY_ALLOC_FAILED");}
 CC_SHA256_CTX ctx;CC_SHA256_Init(&ctx);
 unsigned long long completed=0;int ok=1;
 while(completed<size&&!stopping){
  size_t requested=(size-completed>COPY_CHUNK)?COPY_CHUNK:(size_t)(size-completed);
  ssize_t n=read(src,buf,requested);
  if(n<0&&errno==EINTR)continue;
  if(n<=0){ok=0;break;}
  CC_SHA256_Update(&ctx,buf,(CC_LONG)n);
  ssize_t done=0;
  while(done<n&&!stopping){
   ssize_t written=write(staged,buf+done,(size_t)(n-done));
   if(written<0&&errno==EINTR)continue;
   if(written<=0){ok=0;break;}
   done+=written;
  }
  if(!ok||stopping)break;
  completed+=(unsigned long long)n;
  if(completed%(8*COPY_CHUNK)<COPY_CHUNK){
   printf("COPY_PROGRESS bytes=%llu total=%llu\n",completed,size);fflush(stdout);
  }
 }
 free(buf);
 unsigned char digest[CC_SHA256_DIGEST_LENGTH];char actual[65];
 CC_SHA256_Final(digest,&ctx);hex_digest(digest,actual);
 struct stat last,stageStat;
 if(fstat(src,&last)||fstat(staged,&stageStat))ok=0;
 if(stopping||completed!=size||strcmp(actual,expected)||!ok||
    last.st_dev!=first.st_dev||last.st_ino!=first.st_ino||
    last.st_size!=first.st_size||last.st_mtimespec.tv_sec!=first.st_mtimespec.tv_sec||
    last.st_mtimespec.tv_nsec!=first.st_mtimespec.tv_nsec||
    !S_ISREG(stageStat.st_mode)||stageStat.st_nlink!=1||
    stageStat.st_size!=(off_t)size||fsync(staged)){
  close(staged);unlinkat(dparent,stage,0);
  close(src);close(sparent);close(dparent);
  fail(stopping?"COPY_CANCELLED":"COPY_SOURCE_OR_DIGEST_MISMATCH");
 }
 // Race-free in-destination-filesystem commit: an unexpected entry => EEXIST.
 if(stopping){close(staged);unlinkat(dparent,stage,0);fail("COPY_CANCELLED");}
 if(linkat(dparent,stage,dparent,dstleaf,0)){
  int link_error=errno; // cleanup calls must not erase original EEXIST
  close(staged);unlinkat(dparent,stage,0);
  close(src);close(sparent);close(dparent);
  fail(link_error==EEXIST?"COPY_DESTINATION_EXISTS":"COPY_COMMIT_UNCERTAIN");
 }
 int cleanup=unlinkat(dparent,stage,0);
 int synced=fsync(dparent);
 close(staged);close(src);close(sparent);close(dparent);
 if(cleanup||synced)fail("COPY_COMMIT_UNCERTAIN");
 printf("COPY_DONE bytes=%llu sha256=%s\n",completed,actual);fflush(stdout);
 return 0;
}
