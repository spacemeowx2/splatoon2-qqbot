FROM node:8-alpine
LABEL maintainer="spacemeowx2@gmail.com"

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    zeromq-dev \
    tzdata \
    ffmpeg

RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

COPY package.json /

RUN npm install

VOLUME [ "/code" ]
WORKDIR /code
