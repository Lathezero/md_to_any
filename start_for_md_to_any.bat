@echo off
:: 设置代码页为UTF-8
chcp 65001 > nul

title MD To Any - Markdown Conversion Tool
echo [Start] Starting MD To Any service...
echo [Info] Please wait, browser will open automatically...

:: 启动服务
start /min node server.js

:: 等待服务启动
timeout /t 3 /nobreak > nul

:: 启动浏览器
start http://localhost:3000

echo [Success] Service started successfully!
echo [Info] To close the service, close this window.

:: 保持窗口打开
pause > nul 