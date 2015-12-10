var router = require('express').Router();
var AV = require('leanengine');

var Activity = AV.Object.extend('Activity');
var Participant = AV.Object.extend('Participant');

var Error = function(message) {
  this.message = message;
}

router.route('/')
// 微信，验证服务器地址的有效性。 http://mp.weixin.qq.com/wiki/17/2d4265491f12608cd170a95559800f2d.html
.get(function(req, res, next) {
  signature = req.query.signature;
  timestamp = req.query.timestamp;
  nonce = req.query.nonce;
  echostr = req.query.echostr;

  next(new Error('not implemented'));
})
// 微信，接受与被动回复消息。 http://mp.weixin.qq.com/wiki/14/89b871b5466b19b3efa4ada8e577d45e.html
.post(function(req, res, next) {
  next(new Error('not implemented'));
})

module.exports = router;
