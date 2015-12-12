var router = require('express').Router();
var AV = require('leanengine');
var sha1 = require('js-sha1');
var Promise = require('promise');
var xmlBuilder = new (require('xml2js').Builder)({
  headless: true,
  rootName: 'xml',
  cdata: true,
});
var sprintf = require("sprintf-js").sprintf,
    vsprintf = require("sprintf-js").vsprintf;

// 类型定义

var Activity = AV.Object.extend('Activity', {
  name: function(){return this.get('name');},
}, {
  find: function(keyword) {
    return new AV.Query(this)
      .equalTo('keywords', keyword)
      .descending('updatedAt')
      .lessThanOrEqualTo('startDate', new Date())  // 报名已开放
      .greaterThanOrEqualTo('endDate', new Date()) // 报名未截止
      .limit(2)
      .find().toPromise()
      .then(function(activities) {
        if (activities.length == 0) return Promise.resolve(null); // 如果没有活动，返回null。
        if (activities.length >= 2) console.warn('对于关键字' + keyword + '有多个活动；请检查。');
        return activities[0];
      });
  },
  createResponse: function(keyword, oldMessage) {
    return this.findActivity(keyword)
      .then(function(activity) {
        return activity 
          ? Template.createResponse("_activityEnterInfoPrompt", oldMessage, [activity.name()]) 
          : null;
    })
  },
});
var Participant = AV.Object.extend('Participant');
var Template = AV.Object.extend('Template', {
  msgType: function(){return this.get('msgType');},
  content: function(args) {
    try {
      var c = vsprintf(this.get('content'), args);
      console.log(c);
      return c;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  /**生成一个微信消息的对象（包括FromUserName, ToUserName, CreateTime等）。若创建失败返回null。*/
  toMessage: function(from, to, args) {
    if(this.msgType() === 'text')
      return textMessage(from, to, this.content(args))
    // TODO hanlde other message types here
    return null;
  },
}, {
  /**
   * 查找对应关键字的模板并创建对应的消息对象。如果有多个，以更新时间排序。若没有找到模板或创建失败，返回null。
   * @param keyword 模板查找关键字
   * @param oldMessage 来自用户的消息。新创建的消息对象的接收者与发送者与oldMessage相反。
   * @param args 若
   */
  createResponse: function(keyword, oldMessage, args) {
    return new AV.Query(this)
      .equalTo('keywords', keyword) // as per https://leancloud.cn/docs/js_guide.html#对数组值做查询
      .descending('updatedAt')
      .limit(2)
      .find().toPromise()
      .then(function(templates) {
        console.log(templates);
        if (templates.length == 0) return Promise.resolve(null); // 如果没有模板，返回null。
        if (templates.length >= 2) console.warn('对于关键字' + keyword + '有多个消息模板；请检查。');
        return templates[0].toMessage(oldMessage.ToUserName, oldMessage.FromUserName, args);
    });
  },
})
var Message = AV.Object.extend('Message', {
  Content: function() {return this.get('Content');}
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
  findActivity: function() {
    if(this.Conent().endsWith('报名'))
      return Activity.find(this.Conent().slice(0, -2))
    return Promise.resolve(null);
  },
}, {
  findLastMessageFrom: function(from) {
    return new AV.Query(this)
      .equalTo('FromUserName', from)
      .descending('CreateTime')
      .limit(1)
      .find().toPromise()
      .then(function(messages) {
        return messages[0]; // prevents reject if not found, as opposed to .first()
      });
  }
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

var errorWithStatus = function(message, status) {
  var e = new Error(message);
  e.status = status;
  return e;
}

var textMessage = function(from, to, msg) {
  return {
    ToUserName: to,
    FromUserName: from,
    CreateTime: parseInt(Date.now() / 1000),
    Content: msg,
    MsgType: 'text'
  }
}

// 消息处理逻辑

var handleEventMessage = function(message) {
  return Template.createResponse('event.' + message.Event, 
    message.ToUserName, message.FromUserName);
}
var handleMediaMessage = function(message) {
  return Promise.resolve(null); // sends "_nomatch"
}

var handleTextMessage = function(message) {

  if(message.Conent.endsWith('报名'))
    return Activity.createResponse(message.Content.slice(0, -2), message);

  return Promise.all([
    Template.createResponse(message.Content, message)
  ]).then(function(results) {
    return results[0] || results[1]; // if both null, sends "_nomatch"
  })
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
    if ((process.env.NODE_ENV || 'development') === 'development')
      console.error(error);
    return Message.new(message).setError(error).save().toPromise();
  }).then(function(messageObj) {
    return messageObj.response(); // if any error, this will be null and "该公众号暂时不可用"
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
  // console.log(shaResult);
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
    next(error);
  });
})

module.exports = router;
