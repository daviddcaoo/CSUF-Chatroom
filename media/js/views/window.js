/*
 * WINDOW VIEW
 * TODO: Break it up :/
 */

'use strict';

+function(window, $, _, notify) {

    window.LCB = window.LCB || {};

    window.LCB.WindowView = Backbone.View.extend({
        el: 'html',
        focus: true,
        count: 0,
        mentions: 0,
        initialize: function(options) {

            var that = this;

            this.client = options.client;
            this.rooms = options.rooms;
            this.originalTitle = this.$('title').text();
            this.title = this.originalTitle;

            $(window).on('focus blur', _.bind(this.onFocusBlur, this));

            this.rooms.current.on('change:id', function(current, id) {
                var room = this.rooms.get(id),
                    title = room ? room.get('name') : 'Rooms';
                this.updateTitle(title);
            }, this);

            this.rooms.on('change:name', function(room) {
                if (room.id !== this.rooms.current.get('id')) {
                    return;
                }
                this.updateTitle(room.get('name'));
            }, this);

            this.rooms.on('messages:new', this.onNewMessage, this);

            // Last man standing
            _.defer(function() {
                that.updateTitle();
            });

        },
        onFocusBlur: function(e) {
            this.focus = (e.type === 'focus');
            if (this.focus) {
                clearInterval(this.titleTimer);
                this.count = 0;
                this.mentions = 0;
                this.titleTimer = false;
                this.titleTimerFlip = false;
                this.updateTitle();
            }
        },
        onNewMessage: function(message) {
            if (this.focus || message.historical) {
                return;
            }
            this.countMessage(message);
            this.flashTitle()
        },
        countMessage: function(message) {
            var username = this.client.user.get('username'),
                regex = new RegExp('\\B@(' + username + ')(?!@)\\b', 'i');
            ++this.count;
            regex.test(message.text) && ++this.mentions;
        },
        flashTitle: function() {
            if (!this.titleTimer) {
                this._flashTitle();
                var flashTitle = _.bind(this._flashTitle, this);
                this.titleTimer = setInterval(flashTitle, 1 * 1000);
            }
        },
        _flashTitle: function() {
            var titlePrefix = '';
            if (this.count > 0) {
                titlePrefix += '(' + parseInt(this.count);
                if (this.mentions > 0) {
                    titlePrefix += '/' + parseInt(this.mentions) + '@';
                }
                titlePrefix += ') ';
            }
            var title = this.titleTimerFlip ? this.title : titlePrefix + this.title;
            this.$('title').html(title);
            this.titleTimerFlip = !this.titleTimerFlip;
        },
        updateTitle: function(name) {
            if (!name) {
                var room = this.rooms.get(this.rooms.current.get('id'));
                name = (room && room.get('name')) || 'Rooms';
            }
            if (name) {
                this.title = $('<pre />').text(name).html() +
                ' &middot; ' + this.originalTitle;
            } else {
                this.title = this.originalTitle;
            }
            this.$('title').html(this.title);
        },
    });

    window.LCB.HotKeysView = Backbone.View.extend({
        el: 'html',
        keys: {
            'up+shift+alt down+shift+alt': 'nextRoom',
            's+shift+alt': 'toggleRoomSidebar',
            'g+shift+alt': 'openGiphyModal',
            'space+shift+alt': 'recallRoom'
        },
        initialize: function(options) {
            this.client = options.client;
            this.rooms = options.rooms;
        },
        nextRoom: function(e) {
            var method = e.keyCode === 40 ? 'next' : 'prev',
                selector = e.keyCode === 40 ? 'first' : 'last',
                $next = this.$('.lcb-tabs').find('[data-id].selected')[method]();
            if ($next.length === 0) {
                $next = this.$('.lcb-tabs').find('[data-id]:' + selector);
            }
            this.client.events.trigger('rooms:switch', $next.data('id'));
        },
        recallRoom: function() {
            this.client.events.trigger('rooms:switch', this.rooms.last.get('id'));
        },
        toggleRoomSidebar: function(e) {
            e.preventDefault();
            var view = this.client.view.panes.views[this.rooms.current.get('id')];
            view && view.toggleSidebar && view.toggleSidebar();
        },
        openGiphyModal: function(e) {
            e.preventDefault();
            $('.lcb-giphy').modal('show');
        }
    });

    window.LCB.DesktopNotificationsView = Backbone.View.extend({
        focus: true,
        openNotifications: [],
        openMentions: [],
        initialize: function(options) {
            this.client = options.client;
            this.rooms = options.rooms;
            $(window).on('focus blur unload', _.bind(this.onFocusBlur, this));
            this.rooms.on('messages:new', this.onNewMessage, this);
        },
        onFocusBlur: function(e) {
            this.focus = (e.type === 'focus');
            _.each(_.merge(this.openNotifications, this.openMentions), function(notification) {
                notification.close && notification.close();
            });
        },
        onNewMessage: function(message) {
            if (this.focus || message.historical) {
                return;
            }
            this.createDesktopNotification(message);
        },
        createDesktopNotification: function(message) {

            var that = this;

            if (!notify.isSupported ||
                notify.permissionLevel() != notify.PERMISSION_GRANTED) {
                return;
            }

            var roomID = message.room.id,
                avatar = message.owner.avatar,
                icon = 'https://www.gravatar.com/avatar/' + avatar + '?s=50',
                title = message.owner.displayName + ' in ' + message.room.name,
                mention = message.mentioned;

            var notification = notify.createNotification(title, {
                body: message.text,
                icon: icon,
                tag: message.id,
                autoClose: 1000,
                onclick: function() {
                    window.focus();
                    that.client.events.trigger('rooms:switch', roomID);
                }
            });
            //
            // Mentions
            //
            if (mention) {
                if (this.openMentions.length > 2) {
                    this.openMentions[0].close();
                    this.openMentions.shift();
                }
                this.openMentions.push(notification);
                // Quit early!
                return;
            }
            //
            // Everything else
            //
            if (this.openNotifications.length > 2) {
                this.openNotifications[0].close();
                this.openNotifications.shift();
            }
            this.openNotifications.push(notification);

            setTimeout(function() {
                notification.close();
            }, 1 * 4000);

        }
    });

    window.LCB.PremiumView = Backbone.View.extend({
        events: {
            'click .no': 'no'
        },
        initialize: function(options) {
            this.rooms = options.rooms;
            this.rooms.on('messages:new', this.chaChing, this);
            this.amount(store.get('aprilfools_balance'));
        },
        amount: function(amount) {
            amount = amount || 0.00;
            this.$('.lcb-premium-amount').text(amount.toFixed(2));
        },
        chaChing: function(moneyMaker) {
            if (moneyMaker.historical) {
                // Doubble texation is wrong. lol.
                return;
            }
            var rate = 0.02,
                cost = rate * moneyMaker.text.length,
                balance = store.get('aprilfools_balance');
            if (moneyMaker.text.match(/.gif/i)) {
                cost += 2.50;
            }
            if (moneyMaker.text.match(/houssam is (handsome|awesome|cool)/i)) {
                cost -= 1.00;
            }
            balance += cost;
            if (balance < 0) {
                balance = 0;
            }
            store.set('aprilfools_balance', balance);
            this.amount(balance);
        },
        no: function() {
            $('body')
                .css('-webkit-filter', 'blur(2px)')
                .css('-moz-filter', 'blur(2px)')
                .css('-webkit-transform', 'rotate(180deg)')
                .css('-moz-transform', 'rotate(180deg)')
            ;
            setTimeout(function() {
                  $('body')
                    .css('-webkit-filter', 'none')
                    .css('-moz-filter', 'none')
                    .css('-webkit-transform', 'none')
                    .css('-moz-transform', 'none')
                ;
            }, 20 * 1000);
        }
    });

}(window, $, _, notify);
