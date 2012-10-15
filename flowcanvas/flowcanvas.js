/*
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
// ======================================================================
// Utilities.
// ======================================================================
// Object.getPrototypeOf is broken in IE :-(. Rough attempt of a workaround:
if (!Object.getPrototypeOf) {
    if (typeof this.__proto__ === "object") {
        Object.getPrototypeOf = function (obj) {
			return obj.__proto__;
		};
	} else {
		Object.getPrototypeOf = function (obj) {
			var constructor = obj.constructor,
			oldConstructor;
			if (Object.prototype.hasOwnProperty.call(obj, "constructor")) {
				oldConstructor = constructor;
				if (!(delete obj.constructor)) // reset constructor
					return null; // can't delete obj.constructor, return null
				constructor = obj.constructor; // get real constructor
				obj.constructor = oldConstructor; // restore constructor
			}
			return constructor ? constructor.prototype : null; // needed for IE
		};
	}
}

// Base class for adding a signal/event mechanism.
var FlowCanvasTrackable = function() {
    this._listeners = {
    };

    this.trigger = function(event_name, extra_args) {
        if (!(this._listeners[event_name] instanceof Array))
            return true;
        var listeners = this._listeners[event_name];
        for (var i = 0, len = listeners.length; i < len; i++)
            if (listeners[i].apply(this, extra_args) === false)
                return false;
    };

    this.bind = function(event_name, listener) {
        if (this._listeners[event_name] instanceof Array)
            this._listeners[event_name].push(listener);
        else
            this._listeners[event_name] = [listener];
    };

    this.unbind = function(event_name, listener) {
        if (!(this._listeners[event_name] instanceof Array))
            return;
        this._listeners[event_name] = $.grep(this._listeners[event_name],
                                             function(elem, index) {
            return elem !== listener;
        });
    };
};

var _FlowCanvasObjectSerializer = function() {
    this.serialize_item = function(obj) {
        return {'handle': obj.get_handle(),
                'top': obj.pos().top,
                'left': obj.pos().left,
                'overlay': obj._overlay ? true : false};
    };

    this.deserialize_item = function(canvas, data, obj) {
        obj.pos(data.top, data.left);
        if (data.overlay)
            obj.overlay();
        return obj;
    };

    this.serialize_custom = function(obj) {
        var data = this.serialize_item(obj);
        data.div = obj.container.html();
        return data;
    };

    this.deserialize_custom = function(canvas, data) {
        var obj = new FlowCanvasCustom(canvas, $(data.div));
        return this.deserialize_item(canvas, data, obj);
    };

    this.serialize_image = function(obj) {
        var data = this.serialize_item(obj);
        data.src = obj.container.find('img').attr('src');
        return data;
    };

    this.deserialize_image = function(canvas, data, obj) {
        if (typeof obj === 'undefined')
            obj = new FlowCanvasImage(canvas, data.src);
        return this.deserialize_item(canvas, data, obj);
    };

    this.serialize_exclusivechoice = function(obj) {
        return this.serialize_image(obj);
    };

    this.deserialize_exclusivechoice = function(canvas, data) {
        var obj = new FlowCanvasExclusiveChoice(canvas);
        return this.deserialize_image(canvas, data, obj);
    };

    this.serialize_mail = function(obj) {
        return this.serialize_image(obj);
    };

    this.deserialize_mail = function(canvas, data) {
        var obj = new FlowCanvasMail(canvas);
        return this.deserialize_image(canvas, data, obj);
    };

    this.serialize_db = function(obj) {
        return this.serialize_image(obj);
    };

    this.deserialize_db = function(canvas, data) {
        var obj = new FlowCanvasDB(canvas);
        return this.deserialize_image(canvas, data, obj);
    };

    this.serialize_canvas = function(canvas) {
        var that = this;
        var list = [];
        canvas.div.find('.flowcanvas-item').each(function() {
            var obj = $(this).data('obj');
            list.push(obj.serialize(that));
        });
        return {'items': list};
    };

    this.deserialize_canvas = function(canvas, data) {
        $.each(data.items, function(i, elem_data) {
            var method = 'deserialize_' + elem_data.handle;
            this[method](canvas, elem_data);
        });
    };
};

var _FlowCanvasJSONSerializer = function() {
    this.serialize_canvas = function(canvas) {
        return JSON.stringify(Object.getPrototypeOf(this).serialize_canvas(canvas));
    };

    this.deserialize_canvas = function(canvas, data) {
        var proto = Object.getPrototypeOf(this);
        return proto.deserialize_canvas(canvas, JSON.parse(data));
    };
};
_FlowCanvasJSONSerializer.prototype = new _FlowCanvasObjectSerializer();
var FlowCanvasJSONSerializer = new _FlowCanvasJSONSerializer();

// ======================================================================
// Canvas Items
// ======================================================================
var flowcanvas_items = {};

function FlowCanvasItem(canvas, width, height) {
    if (arguments.length === 0) return;
    if (typeof width === 'undefined')
        width = 100;
    if (typeof height === 'undefined')
        height = 100;

    this.canvas = canvas;
    this.container = $('<div class="flowcanvas-item"></div>');
    this.container.data('obj', this);
    this._overlay = undefined;
    this._inputs = [];
    this._outputs = [];
    var that = this;

    this.get_handle = function() {
        return 'item';
    };

    this.anchor = function(inputs, outputs) {
        // Normalize arguments.
        if (typeof inputs === 'string')
            inputs = [inputs];
        else if (typeof inputs === 'undefined')
            inputs = [];
        if (typeof outputs === 'string')
            outputs = [outputs];
        else if (typeof outputs === 'undefined')
            outputs = [];

        // Remove existing endpoints.
        $.each(this._inputs, function(index, endpoint) {
            that.canvas.jp.deleteEndpoint(endpoint);
        });
        $.each(this._outputs, function(index, endpoint) {
            that.canvas.jp.deleteEndpoint(endpoint);
        });
        this._inputs.length = 0;
        this._outputs.length = 0;

        // Add incoming endpoints.
        $.each(inputs, function(index, input) {
            var endpoint = that.canvas.jp.addEndpoint(that.container, {
                isTarget: true,
                anchor: input
            });
            that._inputs.push(endpoint);
        });

        // Add outgoing endpoints.
        $.each(outputs, function(index, output) {
            var endpoint = that.canvas.jp.addEndpoint(that.container, {
                isSource: true,
                anchor: output,
                maxConnections: -1
            });
            that._outputs.push(endpoint);
        });
    };

    this.make_target = function(anchor) {
        if (typeof anchor === 'undefined')
            anchor = 'Continuous';
        this._inputs = [this.container];
        this.canvas.jp.makeTarget(this.container, {
            endpoint: ['Dot', { radius: 20, cssClass: 'flowcanvas-anchor-invisible' }],
            isTarget: true,
            anchor: anchor
        });
    };

    this.overlay = function(overlay) {
        if (overlay || typeof overlay === 'undefined') {
            if (typeof this._overlay !== 'undefined')
                return;
            this._overlay = $('<div class="flowcanvas-item-overlay"></div>');
            this.container.append(this._overlay);
        }
        else {
            if (typeof this._overlay === 'undefined')
                return;
            this._overlay.remove();
            this._overlay = undefined;
        }
    };

    this.pos = function(top, left) {
        if (typeof top === 'undefined' && typeof left === 'undefined')
            return this.container.offset();
        this.container.css('top', top);
        this.container.css('left', left);
    };

    this.move = function(top_offset, left_offset) {
        var pos = this.pos();
        if (typeof top_offset !== 'undefined')
            pos.top += top_offset;
        if (typeof left_offset !== 'undefined')
            pos.left += left_offset;
        this.pos(pos.top, pos.left);
        return pos;
    };

    this.connect = function(target) {
        if (!this._outputs.length || !target._inputs.length)
            return;
        that.canvas.jp.connect({
            source: this._outputs[0],
            target: target._inputs[0]
        });
    };

    this.serialize = function(serializer) {
        return serializer.serialize_item(this);
    };

    // Add into the canvas.
    canvas.div.append(this.container);
    canvas.jp.draggable(this.container, {
        containment: canvas.div
    });

    this.container.width(width);
    this.container.height(height);
    this.container.css('top', this.canvas.div.height() / 2 - height / 2);
    this.container.css('left', this.canvas.div.width() / 2 - width / 2);

    // Create an event when an item is clicked, but not dragged.
    var in_drag = false;
    this.container.mousedown(function(e) { in_drag = false; });
    this.container.mousemove(function(e) { in_drag = true; });
    this.container.mouseup(function(e) {
        if (!in_drag)
            that.trigger('click', e);
    });
}

FlowCanvasItem.prototype = new FlowCanvasTrackable();

// -----------------------
// Custom item
// -----------------------
function FlowCanvasCustom(canvas, div, width, height) {
    if (arguments.length === 0) return;
    FlowCanvasItem.call(this, canvas, width, height);

    this.get_handle = function() {
        return 'custom';
    };

    this.serialize = function(serializer) {
        return serializer.serialize_custom(this);
    };

    // Add into a container (instead of replacing the container). The reason
    // is that some transformations on a div
    // are not taken into consideration by jQuery, e.g. a zoomed div leads to
    // incorrect drag and drop. This is a know jQuery issue. By hiding such
    // tranformations within another, untransformed, div, we avoid such
    // problems.
    this.container.append(div);
    if (typeof width === 'undefined')
        width = div.width();
    else
        div.width(width);
    if (typeof height === 'undefined')
        height = div.height();
    else
        div.height(height);

    // By default position in the center.
    this.container.css('top', this.canvas.div.height() / 2 - height / 2);
    this.container.css('left', this.canvas.div.width() / 2 - width / 2);
}

FlowCanvasCustom.prototype = new FlowCanvasItem();
FlowCanvasCustom.prototype.constructor = FlowCanvasCustom;
flowcanvas_items.custom = FlowCanvasCustom;

// -----------------------
// Image
// -----------------------
function FlowCanvasImage(canvas, src, width, height) {
    if (arguments.length === 0) return;
    FlowCanvasItem.call(this, canvas, width, height);

    this.get_handle = function() {
        return 'image';
    };

    this.serialize = function(serializer) {
        return serializer.serialize_image(this);
    };

    var img = $('<img/>');
    img.attr('src', src);
    img.attr('width', width);
    img.attr('height', height);
    this.container.append(img);
    this.container.addClass('flowcanvas-item-' + this.get_handle());
}

FlowCanvasImage.prototype = new FlowCanvasItem();
FlowCanvasImage.prototype.constructor = FlowCanvasImage;
flowcanvas_items.image = FlowCanvasImage;

// -----------------------
// Exclusive choice
// -----------------------
function FlowCanvasExclusiveChoice(canvas) {
    FlowCanvasImage.call(this,
                         canvas,
                         'flowcanvas/res/exclusivechoice48.png',
                         48, 48);

    this.get_handle = function() {
        return 'exclusivechoice';
    };

    this.serialize = function(serializer) {
        return serializer.serialize_exclusivechoice(this);
    };

    this.anchor('LeftMiddle', ['TopCenter', 'BottomCenter']);
}

FlowCanvasExclusiveChoice.prototype = new FlowCanvasImage();
FlowCanvasExclusiveChoice.prototype.constructor = FlowCanvasExclusiveChoice;
flowcanvas_items.exclusivechoice = FlowCanvasExclusiveChoice;

// -----------------------
// Mail
// -----------------------
function FlowCanvasMail(canvas) {
    FlowCanvasImage.call(this, canvas, 'flowcanvas/res/mail256.png', 96, 96);

    this.get_handle = function() {
        return 'mail';
    };

    this.serialize = function(serializer) {
        return serializer.serialize_mail(this);
    };

    this.make_target('LeftMiddle');
}

FlowCanvasMail.prototype = new FlowCanvasImage();
FlowCanvasMail.prototype.constructor = FlowCanvasMail;
flowcanvas_items.mail = FlowCanvasMail;

// -----------------------
// Database
// -----------------------
function FlowCanvasDB(canvas) {
    FlowCanvasImage.call(this, canvas, 'flowcanvas/res/db256.png', 96, 96);
    
    this.get_handle = function() {
        return 'db';
    };

    this.serialize = function(serializer) {
        return serializer.serialize_db(this);
    };

    this.make_target('LeftMiddle');
}

FlowCanvasDB.prototype = new FlowCanvasImage();
FlowCanvasDB.prototype.constructor = FlowCanvasDB;
flowcanvas_items.db = FlowCanvasDB;

// ======================================================================
// Canvas
// ======================================================================
var FlowCanvas = function(div) {
    this.div = div;
    this.div.addClass('flowcanvas');

    this.jp = jsPlumb.getInstance({
        ConnectorZIndex: 5,
        HoverPaintStyle: {strokeStyle: 'red'},
        Overlays: [ ['PlainArrow', { location: 0.99, width: 18, length: 23 }] ],
        //Connector: ['Flowchart', { stub: 35, gap: 10} ],
        Endpoint: ['Dot', { radius: 10 }],
        Container: this.div
    });

    this.hits = function(event) {
        // Make sure that the element was dropped within this canvas.
        var pointing_at = event.toElement;
        if (!pointing_at)
            pointing_at = event.relatedTarget;
        if (!pointing_at)
            pointing_at = document.elementFromPoint(event.pageX, event.pageY);
        var target = $(pointing_at);
        return target.parents().andSelf().filter('.flowcanvas').length !== 0;
    };

    this.zoom = function(level) {
        if (typeof level === 'undefined')
            return this.div.css('zoom');
        this.div.animate({'zoom': level});
    };

    this.serialize = function(serializer) {
        return serializer.serialize_canvas(this);
    };

    this.deserialize = function(serializer, data) {
        return serializer.deserialize_canvas(this, data);
    };
};
