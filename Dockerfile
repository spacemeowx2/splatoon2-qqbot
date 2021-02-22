FROM node:14-alpine
LABEL maintainer="spacemeowx2@gmail.com"

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache tzdata

RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

COPY package.json /
COPY yarn.lock /

RUN yarn

VOLUME [ "/code" ]
WORKDIR /code
