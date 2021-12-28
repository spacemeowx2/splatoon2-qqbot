# qqbot

`npm install --production`

## 使用方式

### 依赖环境

#### 1. go-cqhttp

本项目依赖 [`CQHTTP`](https://richardchien.gitee.io/coolq-http-api/) 协议.

因 CoolQ 停止运营, 现在推荐使用协议兼容的 [`go-cqhttp`](https://github.com/Mrs4s/go-cqhttp).

因此需要先运行 `go-cqhttp`, 开启 `WebSocket` 端口. 开启方式见 `go-cqhttp` 项目[文档](https://docs.go-cqhttp.org/).

#### 2. docker-compose (可选)

推荐使用 [`docker-compose`](https://docs.docker.com/compose/) 运行此项目.

### 运行配置

在本项目外新建一个 `docker-compose.yml` 文件.

```
git clone https://github.com/spacemeowx2/splatoon2-qqbot.git
touch docker-compose.yml
```

存入以下内容:

```yaml
version: "2"

volumes:
  qqbot:
    driver: local
  files:
    driver: local
  tsbot:
    driver: local
services:
  tsbot:
    build:
      context: ./splatoon2-qqbot
      dockerfile: ./Dockerfile.prod
    volumes:
      - "./config.json:/code/config.json"
      - tsbot:/tsbot_storage
    environment:
      # 替换成运行 go-cqhttp 的主机地址. 需要注意的是如果 go-cqhttp 没有跑在 docker-compose 内的话建议把 network_mode 改为 host 来访问主机
      - CQ_HOST=127.0.0.1
      # 如果有设置 ACCESS TOKEN 的话可以填到这里.
      - CQ_ACCESS_TOKEN=
      # 替换成管理员的QQ. 所有加群提醒都会提醒到管理员.
      - TSBOT_ADMIN=123456
      # 在此屏蔽其他QQ机器人, 如官方机器人.
      - TSBOT_BLACKLIST=[226015782,2854196310,2854196306,2854196312]
      # 使用文本形式提醒直播.
      - DISABLE_SHARE=1
      # 存放个人档图片等文件
      - BOT_FILE_ROOT=/tsbot_storage
    restart: always
```

之后启动这个 docker-compose 就可以了

```
docker-compose up -d
```
