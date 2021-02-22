module.exports = {
  plugins: [
    ['common'],
    ['./dist/plugins/splatoon2/']
  ],
  type: 'cqhttp:ws',
  port: 8080,
  server: 'ws://localhost:6700',
  selfId: 3218965481,
  secret: 'sfasdfasfwerksajdflaksdf',
  token: 'aaaa',
  nickname: ['sb'],
  prefix: ['.'],
}
