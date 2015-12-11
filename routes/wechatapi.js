var router = require('express').Router();
var AV = require('leanengine');
var sha1 = require('js-sha1');
var Promise = require('promise');

var Activity = AV.Object.extend('Activity');
var Participant = AV.Object.extend('Participant');
var Message = AV.Object.extend('Message', {
  setResponse: function(responseStr) {
    this.set('response', responseStr);
    return this;
  },
  response: function() {
    return this.get('response');
  },
});

var Error = function(message) {
  this.message = message;
}

AV.Promise.prototype.toPromise = function() {
  var self = this;
  var p = new Promise(function(resolve, reject) {
    self.then(function() {
      resolve.apply(p, arguments);
    }, function() {
      reject.apply(p, arguments);
    });
  })
  return p;
}

var handleEventMessage = function(message) {
  return null;
}

var handleTextMessage = function(message) {
  (null)();
}

/**
 * Return a promise that will 
 * 1. Resolve to null if no response shall be sent to the user
 * 2. Resolve to a string that contains the response otherwise
 * 3. Rejects if any error
 */
var handleMessage = function(message) {
  (function() {
    if(message.msgtype === 'text') 
      return handleTextMessage(message);
    if(message.msgtype === 'event')
      return handleEventMessage(message);
    return Promise.resolve("很抱歉，暂时无法处理多媒体消息。");
  })().then(function(responseStr) {
    return Message.new(message).setResponse(responseStr).save().toPromise();
  }, function(error) {
    return Message.new(message).setError(error).save().toPromise();
  }).then(function(messageObj) {
    return Message.response();
  });
}

router.route('/')
.all(function(req, res, next) {
  signature = req.query.signature;
  timestamp = req.query.timestamp;
  nonce = req.query.nonce;
  echostr = req.query.echostr;
  token = process.env.LC_APP_MASTER_KEY;
  result = [token, timestamp, nonce].sort().join("")
  if(sha1(result) === signature)
    next();
  else
    next(new Error('cannot authenticate.'));
})
// 微信，验证服务器地址的有效性。 http://mp.weixin.qq.com/wiki/17/2d4265491f12608cd170a95559800f2d.html
.get(function(req, res, next) {
  res.type('text').send(echostr);
})
// 微信，接受与被动回复消息。 http://mp.weixin.qq.com/wiki/14/89b871b5466b19b3efa4ada8e577d45e.html
.post(function(req, res, next) {
  message = req.body.xml;
  handleMessage(message).then(function(responseMessage) {
    if(responseMessage) {
      res.type('xml').render('textmsg', {
        tousername: message.fromusername,
        fromusername: message.tousername,
        createtime: parseInt(Date.now() / 1000),
        content: responseMessage,
      });
    } else {
      res.send(); // ignore this message
    }
    // no need to pass to next()
  }, function(error) {
    next(error);
  });
})

module.exports = router;
