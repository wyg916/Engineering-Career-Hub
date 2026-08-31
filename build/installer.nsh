!macro customUnInstall
  IfSilent keepStudyData
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除学习进度、收藏和个人笔记？\r\n选择“否”将保留数据，重新安装后可继续学习。" IDNO keepStudyData
  RMDir /r "$APPDATA\EngineeringExperienceStudyCenter"
  keepStudyData:
!macroend
