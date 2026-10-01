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

static void fail(const char *code){fprintf(stderr,"%s\n",code);exit(2);}
static void close_ok(int fd){if(close(fd))fail("MKDIR_CLOSE_UNCERTAIN");}

int main(int argc,char **argv){
 if(argc!=2||!argv[1]||argv[1][0]!='/'||strlen(argv[1])>=PATH_MAX)
  fail("MKDIR_INVALID_PATH");
 char path[PATH_MAX];strcpy(path,argv[1]);
 char *save=NULL,*part=strtok_r(path,"/",&save);
 if(!part)fail("MKDIR_INVALID_PATH");
 int parent=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 if(parent<0)fail("MKDIR_PARENT_UNSAFE");
 while(part){
  if(!strcmp(part,".")||!strcmp(part,".."))fail("MKDIR_TRAVERSAL_DENIED");
  char *next=strtok_r(NULL,"/",&save);
  if(!next)break;
  int child=openat(parent,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(child<0)fail("MKDIR_PARENT_UNSAFE");
  close_ok(parent);parent=child;part=next;
 }
 if(mkdirat(parent,part,0700)){
  if(errno==EEXIST)fail("MKDIR_DESTINATION_EXISTS");
  if(errno==ELOOP||errno==ENOTDIR)fail("MKDIR_PARENT_UNSAFE");
  fail("MKDIR_CREATE_FAILED");
 }
 struct stat made;
 if(fstatat(parent,part,&made,AT_SYMLINK_NOFOLLOW)||!S_ISDIR(made.st_mode)||
    made.st_nlink<2||made.st_uid!=geteuid())
  fail("MKDIR_IDENTITY_UNCERTAIN");
 if(fsync(parent))fail("MKDIR_FSYNC_UNCERTAIN");
 close_ok(parent);
 printf("MKDIR_DONE dev=%llu ino=%llu\n",
   (unsigned long long)made.st_dev,(unsigned long long)made.st_ino);
 return 0;
}
