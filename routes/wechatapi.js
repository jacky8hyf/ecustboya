var router = require('express').Router();
var AV = require('leanengine');
var sha1 = require('js-sha1');
var Promise = require('promise');
var xmlBuilder = new (require('xml2js').Builder)({
  headless: true,
  rootName: 'xml',
  cdata: true,
});
var sprintfjs = require("sprintf-js");
var sprintf = sprintfjs.sprintf,
    vsprintf = sprintfjs.vsprintf;
var isArray = require('../lib/utils').isArray;

var SIGN_UP_ACTIVITY_SUFFIX = require('../lib/constants').SIGN_UP_ACTIVITY_SUFFIX;

// 类型定义
var models = require('../models');
var Activity = models.Activity,
    Message  = models.Message,
    Participant = models.Participant,
    Template = models.Template;

// 消息处理逻辑

var respondSignUp = function(message) {
  var mo;
  var activity;
  var count;
  return Message.findLastMessageFrom(message.FromUserName)
    .then(function(message) {
      if(!message) return Promise.reject();
      return message.findActivity();
    }).then(function(foundActivity) {
      if(!foundActivity) return Promise.reject();
      activity = foundActivity;
      mo = message.Content.match(/^\s*(.*?)\s+(.*?)\s+(\d*?)\s+([\+\d]{11,14})\s*$/);
      if(!mo) 
        return Promise.reject(["_inputError",activity.name()]);
      return activity.allowJoin(message.FromUserName);
    }).then(function(results) {
      count = results[1];
      if(count >= activity.capacity)
        return Promise.reject("_activityFull");
      return Participant.new({
        activity: activity,
        name: mo[1],
        cls: mo[2],
        studentId: mo[3],
        phoneNumber: mo[4],
        wechatOpenId: message.FromUserName,
      }).save();
    }).then(function(participant) {
      return Promise.reject("_activityJoined")
    }).then(function(){}, function(args) {
      var key, formatArgs;
      if(isArray(args)) {
        key = args[0];
        formatArgs = args.slice(1);
      } else {
        key = args;
      }
      return key ? Template.createResponse(key, message, formatArgs) : Promise.resolve(null);
    });
}

var handleEventMessage = function(message) {
  return Template.createResponse('event.' + message.Event, message);
}
var handleMediaMessage = function(message) {
  return Promise.resolve(null); // sends "_nomatch"
}

var handleTextMessage = function(message) {
  if(message.Content.endsWith(SIGN_UP_ACTIVITY_SUFFIX))
    return Activity.createResponse(message.Content.slice(0, -SIGN_UP_ACTIVITY_SUFFIX.length), message);
  return Template.createResponse(message.Content, message)
    .then(function(response) {
      return response || respondSignUp(message);
    }).then(function(response) {
      return response;
    }, function(reason) {
      return Promise.reject(reason);
    });
}

/**
 * Return a promise that will 
 * 1. Resolve to whatever template with keyword "_nomatch" if no response 
 *    shall be sent to the user
 *    * If even this template is not found, resolves to null
 * 2. Resolve to an object that contains the response otherwise
 * 3. Rejects if any error
 */
var handleMessage = function(message) {
  return (function() {
    if(message.MsgType === 'text') 
      return handleTextMessage(message);
    if(message.MsgType === 'event')
      return handleEventMessage(message);
    return handleMediaMessage(message);
  })().then(function(response) {
    return response || Template.createResponse("_nomatch", message);
  }).then(function(response) {
    return Message.new(message).setResponse(response).save().toPromise();
  }, function(error) {
    return Message.new(message).setError(error).save().toPromise();
  }).then(function(messageObj) {
    if(messageObj.error)
      return Promise.reject(messageObj.error); // if any error, this will be not null and "公众号不可用".
    return messageObj.response(); 
  });
}

// 路由

router.route('/')
.all(function(req, res, next) {
  var token = process.env.LC_APP_MASTER_KEY;
  if(!req.query.timestamp || !req.query.nonce) {
    next(errorWithStatus('cannot authenticate request (params).', 400));
    return;
  }
  if(process.env.NODE_ENV === 'production' && Math.abs(Date.now() / 1000 - parseInt(req.query.timestamp)) > 60000) {
    next(errorWithStatus('cannot authenticate request (expires).', 401));
    return;
  }
  var shaResult = sha1([token, req.query.timestamp, req.query.nonce].sort().join(""));
  if(shaResult !== req.query.signature) {
    next(errorWithStatus('cannot authenticate request (sha1).', 401));
    return;
  }
  next();
})
// 微信，验证服务器地址的有效性。 http://mp.weixin.qq.com/wiki/17/2d4265491f12608cd170a95559800f2d.html
.get(function(req, res, next) {
  res.type('text').send(req.query.echostr);
})
// 微信，接收与被动回复消息。 http://mp.weixin.qq.com/wiki/14/89b871b5466b19b3efa4ada8e577d45e.html
.post(function(req, res, next) {
  var message = req.body.xml;
  if(message.CreateTime)
    message.CreateTime = parseInt(message.CreateTime)
  handleMessage(message).then(function(responseMessage) {
    if(responseMessage) {
      var xml = xmlBuilder.buildObject(responseMessage)
      res.type('xml').send(xml);
    } else {
      res.send(); // ignore this message
    }
    // no need to pass to next()
  }, function(error) {
    // should not reach here
    next(error);
  });
})

module.exports = router;
