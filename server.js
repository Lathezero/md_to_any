const express = require('express');
const puppeteer = require('puppeteer-core');
const bodyParser = require('body-parser');
const path = require('path');
const { marked } = require('marked');
const htmlToDocx = require('html-to-docx');
const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const os = require('os');

// 查找可能的浏览器路径
const findChromePath = () => {
    // Windows - Edge路径
    const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    
    // Windows - Chrome路径
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    // 尝试所有可能的路径
    const allPaths = [...edgePaths, ...chromePaths];
    for (const browserPath of allPaths) {
        if (fs.existsSync(browserPath)) {
            return browserPath;
        }
    }
    
    // 如果找不到浏览器，抛出错误
    throw new Error('找不到Chrome或Edge浏览器，请确保已安装其中一个浏览器');
};

const app = express();
const port = 3000;

// 浏览器实例
let browserInstance = null;

// 启动浏览器实例并保持运行
async function initBrowser() {
    try {
        const executablePath = findChromePath();
        console.log(`使用浏览器: ${executablePath}`);
        
        browserInstance = await puppeteer.launch({
            executablePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            ignoreHTTPSErrors: true
        });
        
        console.log('浏览器实例已启动');
        
        // 当浏览器关闭时重新启动
        browserInstance.on('disconnected', async () => {
            console.log('浏览器实例已断开，正在重新启动...');
            browserInstance = null;
            await initBrowser();
        });
    } catch (error) {
        console.error('启动浏览器实例失败:', error);
        browserInstance = null;
        // 30秒后重试
        setTimeout(initBrowser, 30000);
    }
}

// 解析 application/json
app.use(bodyParser.json({ limit: '50mb' }));

// 提供静态文件目录
app.use(express.static(path.join(__dirname)));

// 创建输出目录
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// 前端发送 POST 请求到 /convert，处理 Markdown 转图片和Word逻辑
app.post('/convert', async (req, res) => {
    const markdownContent = req.body.markdown;
    
    if (!markdownContent) {
        return res.status(400).json({ error: '未提供Markdown内容' });
    }
    
    let page = null;
    
    try {
        // 确保浏览器实例已启动
        if (!browserInstance) {
            await initBrowser();
        }
        
        // 如果仍然无法启动浏览器，返回错误
        if (!browserInstance) {
            throw new Error('无法启动浏览器实例');
        }
        
        page = await browserInstance.newPage();
        
        // 设置超时时间更合理 (30秒)
        page.setDefaultTimeout(30000);
        
        // 使用 marked 将 Markdown 转换为 HTML
        const htmlContent = marked(markdownContent);
        
        // 将转换后的 HTML 内容加载到页面中
        await page.setContent(`
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; }
                    h1, h2, h3, h4, h5, h6 { margin: 20px 0 10px; padding: 0; }
                    p { margin: 10px 0; }
                    pre { background: #f4f4f4; padding: 10px; }
                    code { background: #f4f4f4; padding: 2px 4px; }
                    blockquote { margin: 0; padding-left: 10px; border-left: 5px solid #ccc; color: #666; }
                    ul, ol { margin: 10px 0; padding: 0 20px; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    img { max-width: 100%; height: auto; }
                </style>
                <script>
                    // MathJax仅在需要时加载
                    function loadMathJax() {
                        return new Promise((resolve, reject) => {
                            // 检查是否有数学公式
                            if (document.body.textContent.includes('$')) {
                                console.log('检测到数学公式，加载MathJax');
                                const script = document.createElement('script');
                                script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
                                script.onload = () => {
                                    MathJax.typesetPromise().then(() => {
                                        console.log('MathJax渲染完成');
                                        resolve(true);
                                    }).catch((err) => {
                                        console.error('MathJax渲染错误:', err);
                                        reject(err);
                                    });
                                };
                                script.onerror = (err) => {
                                    console.error('MathJax加载失败:', err);
                                    reject(err);
                                };
                                document.head.appendChild(script);
                            } else {
                                console.log('未检测到数学公式，跳过MathJax');
                                resolve(false);
                            }
                        });
                    }
                    
                    // 页面加载完成后通知
                    window.onload = () => {
                        loadMathJax().then((mathjaxLoaded) => {
                            window.status = 'rendered';
                        }).catch(err => {
                            window.status = 'error';
                        });
                    };
                </script>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `);
        
        // 等待渲染完成
        await page.waitForFunction('window.status === "rendered" || window.status === "error"', { timeout: 30000 })
            .catch(err => {
                console.warn('等待渲染超时，继续处理：', err.message);
            });
        
        // 截取整个页面的图片
        const imageBuffer = await page.screenshot({ 
            type: 'png', 
            fullPage: true,
            omitBackground: true // 透明背景
        });
        
        // 关闭页面（不关闭浏览器）
        await page.close();
        page = null;
        
        // 创建唯一的文件名（基于时间戳）
        const timestamp = Date.now();
        const docxFilename = `output_${timestamp}.docx`;
        const docxPath = path.join(outputDir, docxFilename);
        
        // 将 HTML 内容转换为 Word 文档
        const docxBuffer = await htmlToDocx(htmlContent, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        });
        
        // 保存 Word 文件到本地
        await writeFileAsync(docxPath, docxBuffer);
        
        // 发送 HTML、图片和 Word 文档下载链接给前端
        res.json({ 
            html: htmlContent, 
            image: imageBuffer.toString('base64'), 
            wordUrl: `/download/${docxFilename}`
        });
        
    } catch (error) {
        console.error('转换过程发生错误:', error);
        if (page) {
            await page.close().catch(err => console.error('关闭页面失败:', err));
        }
        
        res.status(500).json({
            error: '转换失败', 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 提供下载 Word 文档的路由
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const docxPath = path.join(outputDir, filename);
    
    // 检查文件是否存在
    if (!fs.existsSync(docxPath)) {
        return res.status(404).send('文件不存在');
    }
    
    res.download(docxPath);
});

// 清理超过30分钟的临时文件
function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(outputDir);
        const currentTime = Date.now();
        const thirtyMinutesInMs = 30 * 60 * 1000;
        
        files.forEach(file => {
            const filePath = path.join(outputDir, file);
            const stats = fs.statSync(filePath);
            const fileAge = currentTime - stats.mtimeMs;
            
            if (fileAge > thirtyMinutesInMs) {
                fs.unlinkSync(filePath);
                console.log(`已删除旧文件: ${file}`);
            }
        });
    } catch (error) {
        console.error('清理旧文件失败:', error);
    }
}

// 每小时清理一次旧文件
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// 启动服务器
app.listen(port, async () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    await initBrowser();
});

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('正在关闭服务器...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit(0);
});
