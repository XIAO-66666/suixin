# 专属Q版小人物

入口：单人养宠 → 小人物形象 / 照片定制；好友 → 共同小窝 → 小人物形象 / 照片定制。

两款Q版三头身人物示例可以直接使用，游客也可选择。更换形象保留名字、性格、成长记录。双人小窝需要另一位好友确认形象提议。

照片转绘需要登录与运营方配置。原照片先在浏览器本地预览，缩小至最长边 768 像素。点击生成并勾选同意后，服务器才会将照片发送给 OpenAI Images API。原照片不会写入随心数据库或磁盘；生成的 PNG 保存在账号私有数据库，本人及使用该形象的共同小窝成员可访问。退出共同小窝后，好友不再拥有访问权限。删除账号会删除该账号生成的图片。服务提供方按其隐私政策处理照片。

当前版本没有自动重试生成请求，以免重复扣费。每个账号每小时最多发起三次，服务端同时最多两次。关闭页面或连接中断时，服务商可能已完成请求并产生费用；未应用的结果不会改变已有宠物。正式大规模开放前，应增加计费额度、持久任务队列与超时恢复。

## 运营配置

在运行服务端的同一环境安全配置 `OPENAI_API_KEY` 后重启服务。不要把密钥放入网页、代码仓库或聊天中。可选 `SUIXIN_IMAGE_MODEL`，默认 `gpt-image-2`。需要可访问 OpenAI API 的网络、相应模型权限及可用额度。未配置时界面会显示“照片转绘暂未开放”，不会将原照片冒充生成结果。

实现调用官方图片编辑端点，使用 JSON `images` 数据 URL；如运营方改用其他模型，需确认兼容参数。参考：[官方图片编辑接口](https://developers.openai.com/api/reference/resources/images/methods/edit)、[图片生成指南](https://developers.openai.com/api/docs/guides/image-generation)。真实人物转绘尚未在本项目中进行付费在线验证；自动化测试用替身服务验证授权和保存流程。

## 默认素材记录

通过内置 imagegen 工具生成，四次独立生成，透明 PNG 原稿保留于 `assets/pets/*.png`；应用使用缩小后的 WebP。没有使用 CLI 或额外安装图像生成客户端。

统一提示词：

Use case: stylized-concept. Asset type: premium cozy mobile companion game character, single standalone transparent PNG. Primary request: [SUBJECT]. A beautiful collectible plush toy animal, irresistibly charming and tasteful, tactile velvety felt and soft fluffy fur, gentle subtle watercolor-like surface, refined soft 3D storybook rendering. Full body seated facing viewer in a very slight three-quarter angle, oversized round head but natural expressive face, friendly relaxed smile, blush cheeks, no clothing, no accessories. Warm diffuse studio lighting, delicate highlights, beautifully sculpted volume, no harsh outlines. Character centered, occupies 75 percent of square image; entire ears, feet, and tail visible with generous empty transparent margin. Consistent family art direction: warm oatmeal, cream, dusty rose and caramel tones, simple readable silhouette at 100px. Genuine transparent background with alpha, no scene, no floor, no ground shadow, no text, no watermark, no UI, one animal only.

四个 SUBJECT：

- cat: a tiny apricot-orange tabby kitten with a cream muzzle and belly, little triangular ears, amber-brown bead eyes, a curled striped tail
- dog: a tiny caramel-and-cream puppy with soft floppy ears, a round cream muzzle, chocolate bead eyes, tiny paws and a short waggy tail
- rabbit: a tiny ivory bunny with soft peach-pink inside its long droopy ears, warm brown bead eyes, a small peach nose, tiny round paws
- redpanda: a tiny cinnamon red panda with cream cheek patches and eyebrow spots, chocolate paws, warm brown bead eyes, and a beautifully curled striped russet tail


2026-10-19：按用户选择改为三头身Q版人物，保留发型、眼镜和穿搭。默认人物通过内置 imagegen 生成，原稿 assets/pets/hoodie.png、glasses.png，网页使用同名 WebP。旧动物资料兼容读取，界面展示新人物，不清空成长记录。

本次人物素材提示词：Create a premium cozy app companion asset: one adorable HUMAN chibi character, exactly three heads tall, oversized rounded head and small fully clothed human body, standing in a relaxed friendly pose, entire body shoes and hair visible, warm soft 3D storybook illustration, refined matte toy-like texture, expressive gentle dark eyes, delicate rosy cheeks. [OUTFIT] Charming stylized human face and human hands, no animal features, no ears or tail or costume, not baby, no text, no watermark. One character centered with generous margin, square composition, genuine transparent background, no floor no shadow, consistent warm cream and caramel palette.

OUTFIT hoodie: Short tousled chestnut hair, cream oversized hoodie, caramel trousers, white sneakers, small welcoming wave.

OUTFIT glasses: Shoulder-length dark brown hair, round thin-rim glasses, dusty sage cardigan over ivory shirt, tan trousers, cream sneakers, hands relaxed.
