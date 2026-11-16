@echo off
rem ============================================================
rem  Chime display (tools/chime) launcher for the classroom PC
rem  - Opens Microsoft Edge in app mode (no address bar / tabs)
rem  - Maximized window, so the Windows taskbar stays visible
rem  - Uses a separate Edge profile so that sound can start
rem    without clicking (autoplay allowed only for this window)
rem  To start automatically at sign-in, put a shortcut to this
rem  file in:  shell:startup  (Win+R -> shell:startup)
rem ============================================================
set URL=https://telcation.f5.si/tools/chime/
start "" msedge --app=%URL% --start-maximized --user-data-dir="%LOCALAPPDATA%\ToolsChime" --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check
