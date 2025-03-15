const express = require('express');
const puppeteer = require('puppeteer-core');
const bodyParser = require('body-parser');
const path = require('path');
const { marked } = require('marked');
const htmlToDocx = require('html-to-docx');
const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);

const app = express();
const port = 3000;

// 解析 application/json
app.use(bodyParser.json());

// 提供静态文件目录
app.use(express.static('D:\\JetBrains\\md_to_word_and_pic'));

// 前端发送 POST 请求到 /convert，处理 Markdown 转图片和Word逻辑
app.post('/convert', async (req, res) => {
    const markdownContent = req.body.markdown;

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', // Edge 浏览器路径，根据实际情况修改
        });
        const page = await browser.newPage();

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
                </style>
                <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
            </head>
            <body>
                ${htmlContent}
                <script>
                    MathJax.typesetPromise().then(() => {
                        window.status = 'rendered';
                    }).catch((err) => {
                        window.status = 'error';
                        console.error('MathJax rendering error:', err);
                    });
                </script>
            </body>
            </html>
        `);

        // 增加等待时间，确保 MathJax 渲染完成
        await page.waitForFunction('window.status === "rendered" || window.status === "error"', { timeout: 120000 });

        // 检查是否有渲染错误
        const renderStatus = await page.evaluate(() => window.status);
        if (renderStatus === 'error') {
            throw new Error('MathJax rendering error');
        }

        // 截取整个页面的图片
        const imageBuffer = await page.screenshot({ type: 'png', fullPage: true });

        // 关闭浏览器
        await browser.close();

        // 将 HTML 内容转换为 Word 文档
        const docxBuffer = await htmlToDocx(htmlContent, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        });

        // 保存 Word 文件到本地
        const docxPath = path.join(__dirname, 'output.docx');
        await writeFileAsync(docxPath, docxBuffer);

        // 发送 HTML、图片和 Word 文档下载链接给前端
        res.json({ html: htmlContent, image: imageBuffer.toString('base64'), wordUrl: '/download/output.docx' });
    } catch (error) {
        console.error('发生错误:', error);
        res.status(500).send('发生错误，请检查日志');
        if (browser) {
            await browser.close();
        }
    }
});

// 提供下载 Word 文档的路由
app.get('/download/output.docx', (req, res) => {
    const docxPath = path.join(__dirname, 'output.docx');
    res.download(docxPath);
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});
