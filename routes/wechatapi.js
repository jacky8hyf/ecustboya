var router = require('express').Router();
var AV = require('leanengine');
var sha1 = require('js-sha1');
var Promise = require('promise');

// 类型定义

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
  setError: function(errorObj) {
    this.set('error', errorObj.toJSON());
    return this;
  },
  error: function() {
    return this.get('error');
  },
});

// Helper functions / methods

Object.defineProperty(Error.prototype, 'toJSON', {
  value: function () {
    var alt = {};

    Object.getOwnPropertyNames(this).forEach(function (key) {
        alt[key] = this[key];
    }, this);

    return alt;
  },
  configurable: true
});

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

var ErrorWithStatus = function(message, status) {
  var e = new Error(message);
  e.status = status;
  return e;
}

// 消息处理逻辑

var handleEventMessage = function(message) {
  return Promise.resolve(null);
}

var handleTextMessage = function(message) {
  return new Promise(function(resolve, reject) {
    (null)();
    resolve();
  });
}

/**
 * Return a promise that will 
 * 1. Resolve to null if no response shall be sent to the user
 * 2. Resolve to a string that contains the response otherwise
 * 3. Rejects if any error
 */
var handleMessage = function(message) {
  return (function() {
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
    return messageObj.response();
  });
}

// 路由

router.route('/')
.all(function(req, res, next) {
  var token = process.env.LC_APP_MASTER_KEY;
  if(!req.query.timestamp || !req.query.nonce) {
    next(ErrorWithStatus('cannot authenticate request (params).', 400));
    return;
  }
  if(process.env.NODE_ENV === 'production' && Math.abs(Date.now() / 1000 - parseInt(req.query.timestamp)) > 60000) {
    next(ErrorWithStatus('cannot authenticate request (expires).', 401));
    return;
  }
  if(sha1([token, req.query.timestamp, req.query.nonce].sort().join("")) !== req.query.signature) {
    next(ErrorWithStatus('cannot authenticate request (sha1).', 401));
    return;
  }
  
  next();
})
// 微信，验证服务器地址的有效性。 http://mp.weixin.qq.com/wiki/17/2d4265491f12608cd170a95559800f2d.html
.get(function(req, res, next) {
  res.type('text').send(req.query.echostr);
})
// 微信，接受与被动回复消息。 http://mp.weixin.qq.com/wiki/14/89b871b5466b19b3efa4ada8e577d45e.html
.post(function(req, res, next) {
  var message = req.body.xml;
  if(message.createtime)
    message.createtime = parseInt(message.createtime)
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
