var router = require('express').Router();
var AV = require('leanengine');
var sha1 = require('js-sha1');

var Activity = AV.Object.extend('Activity');
var Participant = AV.Object.extend('Participant');

var Error = function(message) {
  this.message = message;
}

var handleMessage = function(message) {
  // console.log(message)
  return message.msgtype === 'text' ? (message.content || '') : "很抱歉，暂时无法处理多媒体消息。"
}

router.route('/')
// 微信，验证服务器地址的有效性。 http://mp.weixin.qq.com/wiki/17/2d4265491f12608cd170a95559800f2d.html
.get(function(req, res, next) {
  signature = req.query.signature;
  timestamp = req.query.timestamp;
  nonce = req.query.nonce;
  echostr = req.query.echostr;
  token = process.env.LC_APP_MASTER_KEY;
  result = [token, timestamp, nonce].sort().join("")
  console.log('Computing SHA-1 for ', result)
  if(sha1(result) === signature)
    res.type('text').send(echostr);
  else
    next(new Error('cannot authenticate.'))
})
// 微信，接受与被动回复消息。 http://mp.weixin.qq.com/wiki/14/89b871b5466b19b3efa4ada8e577d45e.html
.post(function(req, res, next) {
  // setTimeout(function() {
  //   res.send(); // abnormally exits; will not respond to user as per http://mp.weixin.qq.com/wiki/14/89b871b5466b19b3efa4ada8e577d45e.html
  // }, 5000);
  message = req.body.xml;
  // try {
  messageToSend = handleMessage(message);
  // } catch (e) {
  //   if(process.env.NODE_ENV || 'development')
  //     console.error(e.stack)
  //   res.send(); // abnormally exits
  //   return;
  // }
  res.type('xml').render('textmsg', {
    tousername: message.fromusername,
    fromusername: message.tousername,
    createtime: parseInt(Date.now() / 1000),
    content: messageToSend,
  });
})

module.exports = router;
