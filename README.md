# 随心

一个记录日常、寻找小灵感、与朋友分享和照顾 Q 版伙伴的轻量应用。

## 本机运行

需要 Python 3.10 或更新版本，无需安装 Python 第三方依赖。

```sh
python server.py
```

打开 http://127.0.0.1:8082 。完整功能需要这个服务端，GitHub Pages 只能承载静态体验，无法提供登录、好友和同步。

## 当前功能

- 日常灵感、心情、生活记录、搜索及备份。
- 用户账号、恢复码、好友申请、消息、免打扰和拉黑。
- 个人云同步、版本冲突选择与账号数据导出。
- 单人伙伴和双人小窝、共同约定、双方完成确认、回忆及成长。
- Q 版三头身人物示例，好友确认后更换共同形象。

照片转绘接口已实现，但需要运营方在服务端配置 `OPENAI_API_KEY`，并具有相应模型权限、额度和网络。未配置时不可生成。真人照片转绘未进行付费在线验收，不能视为已经上线的能力。详见 [人物定制说明](PET-STUDIO.md)。

提醒仅在应用打开且联网时检查，关闭应用后没有后台推送。当前为试用版，上 GitHub 不等于已部署为公网 App 或小程序。

## 检查

```sh
python -m unittest test_server -v
node verify.cjs
```

浏览器验收另需 Node.js 18+ 和 Playwright：

```sh
npm install
npx playwright install chromium
npm run test:browser
npm run test:cache
```

Windows 会优先使用已安装的 Edge；也可用 `SUIXIN_BROWSER_PATH` 指定浏览器，`SUIXIN_PYTHON` 指定 Python。测试创建临时账号及数据库，不使用真实用户数据。

## 发布

```sh
python package_release.py
```

得到 `release/suixin-server.zip` 和 `release/suixin-web.zip`。数据库、上传照片、私有生成结果和密钥不应提交或打包。部署请阅读 [SERVER.md](SERVER.md)，本次验收见 [ACCEPTANCE.md](ACCEPTANCE.md)。
