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

// ======================================================================
// Canvas Items
// ======================================================================
var flowcanvas_items = {};

function FlowCanvasItem(canvas, div, width, height) {
    if (arguments.length === 0) return;
    this.canvas = canvas;
    this.container = $('<div class="flowcanvas-item"></div>');
    this.div = div;
    this._overlay = undefined;
    this._toggle_options = {};
    this._inputs = [];
    this._outputs = [];
    var that = this;

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

    // Add into a container. The reason is that some transformations on a div
    // are not taken into consideration by jQuery, e.g. a zoomed div leads to
    // incorrect drag and drop. This is a know jQuery issue. By hiding such
    // tranformations within another, untransformed, div, we avoid such
    // problems.
    this.container.append(div);
    canvas.div.append(this.container);
    canvas.jp.draggable(this.container, {
        containment: canvas.div
    });

    // By default position in the center.
    if (typeof width === 'undefined')
        width = this.div.width();
    else
        this.div.width(width);
    if (typeof height === 'undefined')
        height = this.div.height();
    else
        that.div.height(height);
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

// -----------------------
// Image
// -----------------------
FlowCanvasItem.prototype = new FlowCanvasTrackable();
flowcanvas_items.item = FlowCanvasItem;

function FlowCanvasImg(canvas, src, width, height) {
    if (arguments.length === 0) return;
    var img = $('<img/>');
    img.attr('src', src);
    FlowCanvasItem.call(this, canvas, img, width, height);
}

FlowCanvasImg.prototype = new FlowCanvasItem();
FlowCanvasImg.prototype.constructor = FlowCanvasImg;
flowcanvas_items.image = FlowCanvasImg;

// -----------------------
// Exclusive choice
// -----------------------
function FlowCanvasExclusiveChoice(canvas) {
    FlowCanvasImg.call(this,
                       canvas, 'flowcanvas/res/exclusivechoice48.png', 48, 48);
    this.anchor('LeftMiddle', ['TopCenter', 'BottomCenter']);
}

FlowCanvasExclusiveChoice.prototype = new FlowCanvasImg();
FlowCanvasExclusiveChoice.prototype.constructor = FlowCanvasExclusiveChoice;
flowcanvas_items.exclusivechoice = FlowCanvasExclusiveChoice;

// -----------------------
// Mail
// -----------------------
function FlowCanvasMail(canvas) {
    FlowCanvasImg.call(this, canvas, 'flowcanvas/res/mail256.png', 96, 96);
    this.make_target('LeftMiddle');
}

FlowCanvasMail.prototype = new FlowCanvasImg();
FlowCanvasMail.prototype.constructor = FlowCanvasMail;
flowcanvas_items.mail = FlowCanvasMail;

// -----------------------
// Database
// -----------------------
function FlowCanvasDB(canvas) {
    FlowCanvasImg.call(this, canvas, 'flowcanvas/res/db256.png', 96, 96);
    this.make_target('LeftMiddle');
}

FlowCanvasDB.prototype = new FlowCanvasImg();
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
        //Endpoint: ['Dot', { cssClass: 'formcanvas-anchor-invisible' }],
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
};
