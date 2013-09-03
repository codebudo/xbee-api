/*
 * xbee-api
 * https://github.com/jouz/xbee-api
 *
 * Copyright (c) 2013 Jan Kolkmeier
 * Licensed under the MIT license.
 */

'use strict';

var util = require('util');

exports = module.exports;
exports.XBeeAPI = XBeeAPI;

var C       = exports.Constants = require('./constants.js');
var T       = exports.tools     = require('./tools.js');
var frame_parsers = require('./frame-parsers');

var _options = {
  raw_frames: false,
  api_mode: 1
};

function XBeeAPI(options) {
  options = options || {};
  options.__proto__ = _options;
  this.options = options;

  this.parseState = {
    buffer: new Buffer(255, 'ascii'),
    offset: 0,         // Offset in buffer
    position: 999,     // Position in packet
    length: 0,         // Packet Length
    total: 0,          // To test Checksum
    checksum: 0x00,    // Checksum byte
    b: 0x00,           // Working byte
    escape_next: false // For escaping in AP=2
  };

  return this;
}


// Todo: don't drop the start byte, pckt length & checksum
// so we can truly emit the "raw" packet.
XBeeAPI.prototype.parser = function() {
  var self = this;
  var S = self.parseState;
  return function(emitter, buffer) {
    for(var i=0; i < buffer.length; i++) {
      S.b = buffer[i];

      if (S.position > 0 && S.b == C.ESCAPE) {
        S.escape_next = true;
        continue;
      }

      if (S.escape_next) {
        S.b = 0x20 ^ S.b;
        S.escape_next = false;
      }

      S.position += 1; 

      // Detected start of packet.
      if (S.b == C.START_BYTE) {
        S.position = 0;
        S.length = 0;
        S.total = 0;
        S.checksum = 0x00;
        S.offset = 0;
        S.escape_next = false;
      }

      if (S.position == 1) S.length += S.b << 8; // most sign. bit of the length
      if (S.position == 2) S.length += S.b;     // least sign. bit of the length

      if ((S.length > 0) && (S.position > 2)) {
        if (S.offset < S.length) {
          S.buffer.writeUInt8(S.b, S.offset++);
          S.total += S.b;
        } else {
          S.checksum = S.b;
        }
      }

      // Packet is complete. Parse & Emit
      if ((S.length > 0) &&
          (S.offset == S.length) &&
          (S.position == S.length + 3)) {
        if (!S.checksum === 255 - (S.total % 256)) {
          throw new Error("Checksum Mismatch", S);
        } else if (self.options.raw_frames) {
          emitter.emit("frame_raw",
                       S.buffer.slice(0, S.offset));
        } else {
          emitter.emit("frame_object",
                       self.ParseAPIFrame(S.buffer.slice(0, S.offset)));
        }
      }
    }
  }
}

XBeeAPI.prototype.ParseAPIFrame = function(buffer) {
  var frame = {
    type: buffer.readUInt8(0) // Read Frame Type
  };
  frame_parsers[frame.type](frame, buffer.slice(1)); // Frame Type Specific Parsing
  return frame;
}