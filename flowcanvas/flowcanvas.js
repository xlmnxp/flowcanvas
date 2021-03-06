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
                'id': obj.get_id(),
                'top': obj.pos().top,
                'left': obj.pos().left,
                'width': obj.container.width(),
                'height': obj.container.height(),
                'target_anchor': obj._target_anchor,
                'inputs': obj._inputs_str,
                'outputs': obj._outputs_str,
                'overlay': obj._overlay ? true : false};
    };

    this.deserialize_item = function(canvas, data, obj) {
        obj.container.width(data.width);
        obj.container.height(data.height);
        obj.set_id(data.id);
        obj.pos(data.top, data.left);
        if (typeof data.target_anchor !== 'undefined')
            obj.make_target(data.target_anchor);
        else
            obj.anchor(data.inputs, data.outputs);
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
        var items = [];
        canvas.div.find('.flowcanvas-item').each(function() {
            var obj = $(this).data('obj');
            items.push(obj.serialize(that));
        });
        var connections = [];
        $.each(canvas.jp.getConnections(), function (index, connection) {
            var endpoints = connection.endpoints;
            var source_ep = endpoints[0];
            var target_ep = endpoints[1];
            var source = source_ep.getElement().data('obj');
            var target = target_ep.getElement().data('obj');
            var source_ep_index = $.inArray(source_ep, source._outputs);
            var target_ep_index = $.inArray(target_ep, target._inputs);
            var source_id = source.get_id();
            var target_id = target.get_id();
            connections.push([
                source_id, source_ep_index,
                target_id, target_ep_index
            ]);
        });
        return {'items': items, 'connections': connections};
    };

    this.deserialize_canvas = function(canvas, data) {
        var that = this;
        $.each(data.items, function(i, elem_data) {
            var method = 'deserialize_' + elem_data.handle;
            that[method](canvas, elem_data);
        });
        $.each(data.connections, function (index, connection) {
            var source_id = connection[0];
            var source_ep_index = connection[1];
            var target_id = connection[2];
            var target_ep_index = connection[3];
            var source = $('#' + source_id);
            var target = $('#' + target_id);
            if (source_ep_index !== -1)
                source = source.data('obj')._outputs[source_ep_index];
            if (target_ep_index !== -1)
                target = target.data('obj')._inputs[target_ep_index];
            canvas.jp.connect({source: source, target: target});
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
    this.container.attr('id', "_autoid" + (new Date()).getTime());
    this.container.data('obj', this);
    this._overlay = undefined;
    this._target_anchor = undefined; // only defined with jsPlumb.makeTarget
    this._inputs_str = [];  // Like this._inputs, but as passed to jsPlumb
    this._outputs_str = [];  // Like this._outputs, but as passed to jsPlumb
    this._inputs = []; // The jsPlumb anchors
    this._outputs = [];
    var that = this;

    this.get_handle = function() {
        return 'item';
    };

    this.set_id = function(id) {
        this.container.attr('id', id);
    };

    this.get_id = function() {
        return this.container.attr('id');
    };

    this.anchor = function(inputs, outputs) {
        // Remove existing endpoints.
        $.each(this._inputs, function(index, endpoint) {
            that.canvas.jp.deleteEndpoint(endpoint);
        });
        $.each(this._outputs, function(index, endpoint) {
            that.canvas.jp.deleteEndpoint(endpoint);
        });
        this._inputs.length = 0;
        this._outputs.length = 0;

        // Normalize arguments into a format that jsPlumb accepts.
        if ($.isArray(inputs))
            this._inputs_str = inputs;
        else if (typeof inputs === 'undefined')
            this._inputs_str = [];
        else
            this._inputs_str = [inputs];
        if ($.isArray(outputs))
            this._outputs_str = outputs;
        else if (typeof outputs === 'undefined')
            this._outputs_str = [];
        else
            this._outputs_str = [outputs];

        // Add incoming endpoints.
        $.each(this._inputs_str, function(index, input) {
            var endpoint = that.canvas.jp.addEndpoint(that.container, {
                isTarget: true,
                anchor: input
            });
            that._inputs.push(endpoint);
        });

        // Add outgoing endpoints.
        $.each(this._outputs_str, function(index, output) {
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
        this._target_anchor = anchor;
        this._inputs.length = 0;
        this._inputs_str = [];
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
        if (!this._outputs.length)
            return;
        if (!target._inputs.length && !target._target_anchor)
            return;
        that.canvas.jp.connect({
            source: this._outputs[0],
            target: target._inputs.length ? target._inputs[0] : target.container
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
        this.jp.deleteEveryEndpoint();
        this.div.empty();
        return serializer.deserialize_canvas(this, data);
    };
};
