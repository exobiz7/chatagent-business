// macOS-only no-overwrite directory publish for self-owned personal restore.
// Invocation: helper absolute_stage_path absolute_new_destination_path expected_stage_dev expected_stage_ino
// openat every parent O_NOFOLLOW; atomic renameatx_np(RENAME_EXCL|RENAME_NOFOLLOW_ANY).
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
static void fail(const char* code){fprintf(stderr,"%s\n",code);exit(2);}
static int open_parent(const char *full,char *leaf){
 if(!full||full[0]!='/'||strlen(full)>=PATH_MAX)fail("PUBLISH_PATH_INVALID");
 char path[PATH_MAX];strcpy(path,full);
 char *save=NULL,*part=strtok_r(path,"/",&save);
 if(!part)fail("PUBLISH_LEAF_INVALID");
 int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 if(fd<0)fail("PUBLISH_ROOT_FAILED");
 while(part){
  if(!strcmp(part,".")||!strcmp(part,".."))fail("PUBLISH_TRAVERSAL_DENIED");
  char *next=strtok_r(NULL,"/",&save);
  if(!next){strcpy(leaf,part);return fd;}
  int child=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(child<0)fail("PUBLISH_PARENT_UNSAFE");
  close(fd);fd=child;part=next;
 }
 fail("PUBLISH_LEAF_INVALID");return -1;
}
int main(int argc,char **argv){
 if(argc!=5)fail("PUBLISH_INPUT_INVALID");
 char *end=NULL;errno=0;
 unsigned long long dev=strtoull(argv[3],&end,10);
 if(errno||!end||*end)fail("PUBLISH_IDENTITY_INVALID");
 errno=0;
 unsigned long long ino=strtoull(argv[4],&end,10);
 if(errno||!end||*end)fail("PUBLISH_IDENTITY_INVALID");
 char sourceLeaf[PATH_MAX],destLeaf[PATH_MAX];
 int srcparent=open_parent(argv[1],sourceLeaf);
 int destparent=open_parent(argv[2],destLeaf);
 struct stat stage;
 if(fstatat(srcparent,sourceLeaf,&stage,AT_SYMLINK_NOFOLLOW)||
   !S_ISDIR(stage.st_mode)||stage.st_nlink<2||
   (unsigned long long)stage.st_dev!=dev||
   (unsigned long long)stage.st_ino!=ino||
   (stage.st_mode&077)!=0||stage.st_uid!=geteuid())
  fail("PUBLISH_STAGE_IDENTITY_MISMATCH");
 if(stage.st_dev!=0){
  struct stat dstparentstat;
  if(fstat(destparent,&dstparentstat)||dstparentstat.st_dev!=stage.st_dev)
   fail("PUBLISH_CROSS_DEVICE_DENIED");
 }
 if(renameatx_np(srcparent,sourceLeaf,destparent,destLeaf,
    RENAME_EXCL|RENAME_NOFOLLOW_ANY)){
  int e=errno;
  fail(e==EEXIST?"PUBLISH_DESTINATION_EXISTS":"PUBLISH_COMMIT_UNCERTAIN");
 }
 if(fsync(destparent))fail("PUBLISH_COMMIT_UNCERTAIN");
 close(srcparent);close(destparent);
 printf("PUBLISH_DONE\n");fflush(stdout);
 return 0;
}
