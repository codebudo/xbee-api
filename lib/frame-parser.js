/*
 * xbee-api
 * https://github.com/jouz/xbee-api
 *
 * Copyright (c) 2013 Jan Kolkmeier
 * Licensed under the MIT license.
 */

'use strict';

var C = require('./constants.js');

var frame_parser = exports = module.exports = {};

// (browserify compitability) We could use buffer.toJSON(),
// but it is not supported by buffer-browserify, yet.
function toArray(buf) {
  return Array.prototype.slice.call(buf, 0);
}

frame_parser[C.FRAME_TYPE.NODE_IDENTIFICATION] = function(frame, buffer) {
  frame.sender64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.sender16 = frame_parser.parseAddress(buffer, 8, 2);
  frame.receiveOptions = buffer.readUInt8(10);
  frame_parser.parseNodeIdentificationPayload(frame, buffer.slice(11));
};

frame_parser[C.FRAME_TYPE.ZIGBEE_RECEIVE_PACKET] = function(frame, buffer) {
  frame.remote64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.remote16 = frame_parser.parseAddress(buffer, 8, 2);
  frame.receiveOptions = buffer.readUInt8(10);
  frame.data = toArray(buffer.slice(11));
};

frame_parser[C.FRAME_TYPE.ZIGBEE_EXPLICIT_RX] = function(frame, buffer) {
  frame_parser[C.FRAME_TYPE.ZIGBEE_RECEIVE_PACKET](frame, buffer);
};

frame_parser[C.FRAME_TYPE.XBEE_SENSOR_READ] = function(frame, buffer) {
  frame.remote64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.remote16 = frame_parser.parseAddress(buffer, 8, 2);
  frame.receiveOptions = buffer.readUInt8(10);
  frame.sensors = buffer.readUInt8(11);
  var data = toArray(buffer.slice(12));
  frame.sensorValues = {
      AD0: Math.round(1000 * (((data[0] << 8) | data[1]) * 5.1) / 255.0),
      AD1: Math.round(1000 * (((data[2] << 8) | data[3]) * 5.1) / 255.0),
      AD2: Math.round(1000 * (((data[4] << 8) | data[5]) * 5.1) / 255.0),
      AD3: Math.round(1000 * (((data[6] << 8) | data[7]) * 5.1) / 255.0),
      T:   (data[8] << 8) | data[9],
      temperature: undefined,
      relativeHumidity: undefined,
      trueHumidity: undefined,
      waterPresent: frame.sensors === 0x60
  };

  if (frame.sensors === 2 || frame.sensors === 3) {
    if (frame.sensorValues.T < 2048) {
      frame.sensorValues.temperature = frame.sensorValues.T / 16;
    } else {
      frame.sensorValues.temperature = -(frame.sensorValues.T & 0x7ff) / 16;
    }
  }

  if (frame.sensors === 1 || frame.sensors === 3) {
    frame.sensorValues.relativeHumidity = Math.round(100 *
        (((frame.sensorValues.AD3 / frame.sensorValues.AD2) -
            0.16) / (0.0062))) / 100;
  }

  if (frame.sensors === 3) {
    frame.sensorValues.trueHumidity = Math.round(100 *
        (frame.sensorValues.relativeHumidity / (1.0546 -
            (0.00216 * frame.sensorValues.temperature)))) / 100;
  }

};

frame_parser[C.FRAME_TYPE.MODEM_STATUS] = function(frame, buffer) {
  frame.modemStatus = buffer.readUInt8(0);
};

frame_parser[C.FRAME_TYPE.ZIGBEE_IO_DATA_SAMPLE_RX] = function(frame, buffer) {
  frame.remote64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.remote16 = frame_parser.parseAddress(buffer, 8, 2);
  frame.receiveOptions = buffer.readUInt8(10);
  frame_parser.ParseIOSamplePayload(frame, buffer.slice(11));
};

frame_parser[C.FRAME_TYPE.AT_COMMAND_RESPONSE] = function(frame, buffer) {
  frame.id = buffer.readUInt8(0);
  frame.command = String.fromCharCode(buffer.readUInt8(1), buffer.readUInt8(2));
  frame.commandStatus = buffer.readUInt8(3);
  frame.commandData = toArray(buffer.slice(4));
  if (frame.command === "ND") {
    frame.nodeIdentification = {};
    frame_parser.parseNodeIdentificationPayload(frame.nodeIdentification, buffer.slice(4));
  }
};

frame_parser[C.FRAME_TYPE.REMOTE_COMMAND_RESPONSE] = function(frame, buffer) {
  frame.id = buffer.readUInt8(0);
  frame.remote64 = frame_parser.parseAddress(buffer, 1, 8);
  frame.remote16 = frame_parser.parseAddress(buffer, 9, 2);
  frame.command = String.fromCharCode(buffer.readUInt8(11), buffer.readUInt8(12));
  frame.commandStatus = buffer.readUInt8(13);
  frame.commandData = toArray(buffer.slice(14));
};

frame_parser[C.FRAME_TYPE.ZIGBEE_TRANSMIT_STATUS] = function(frame, buffer) {
  frame.id = buffer.readUInt8(0);
  frame.remote16 = frame_parser.parseAddress(buffer, 1, 2);
  frame.transmitRetryCount = buffer.readUInt8(3);
  frame.deliveryStatus = buffer.readUInt8(4);
  frame.discoveryStatus = buffer.readUInt8(5);
};

frame_parser[C.FRAME_TYPE.ROUTE_RECORD] = function(frame, buffer) {
  frame.remote64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.remote16 = frame_parser.parseAddress(buffer, 8, 2);
  frame.receiveOptions = buffer.readUInt8(10);
  frame.hopCount = buffer.readUInt8(11);
  frame.addresses = [];
  for (var i=0; i<frame.hopCount; i++) {
    frame.addresses.push(buffer.readUInt16BE(12 + (i * 2)));
  }
};



// Todo: this function has a different profile...
frame_parser.parseAddress = function(buffer, offset, length) {
  var _buffer = new Buffer(length);
  buffer.copy(_buffer, 0, offset, offset+length);
  return _buffer.toString('hex');
  // ALTERNATIVE:
  // return toArray(buffer.slice(offset,offset+length));
};

frame_parser.parseNodeIdentificationPayload = function(frame, buffer) {
  frame.remote16 = frame_parser.parseAddress(buffer, 0, 2);
  frame.remote64 = frame_parser.parseAddress(buffer, 2, 8);
  frame.nodeIdentifier = "";
  var ni = 10; // or 11?
  while (ni < buffer.length) { // TODO
    var byte = buffer.readUInt8(ni++);
    if (byte === 0) break;
    frame.nodeIdentifier += String.fromCharCode(byte);
  }
  frame.remoteParent16 = frame_parser.parseAddress(buffer, ni, 2);
  frame.deviceType = buffer.readUInt8(ni+2);
  frame.sourceEvent = buffer.readUInt8(ni+3);
  frame.digiProfileID = frame_parser.parseAddress(buffer, ni+4, 2);
  frame.digiManufacturerID = frame_parser.parseAddress(buffer, ni+6, 2);
};

frame_parser.ParseIOSamplePayload = function(frame, buffer) {
  frame.digitalSamples = {};
  frame.analogSamples = {};
  frame.numSamples = buffer.readUInt8(0);
  var mskD = toArray(buffer.slice(1, 3)); 
      mskD = (mskD[0] << 8) | mskD[1];
  var mskA = buffer.readUInt8(3);
  var analogSliceLocation = 4; //if there is no mskD then analog data lives at position 4

  if (mskD > 0) {
    analogSliceLocation = 6; // there is an mskD so analog data lives at position 6
    var digitalSamples = toArray(buffer.slice(4, 6));
    var valD = (digitalSamples[0] << 8) | digitalSamples[1];
    for (var dbit in C.DIGITAL_CHANNELS.MASK) {
      if ((mskD & (1 << dbit)) >> dbit) {
        frame.digitalSamples[C.DIGITAL_CHANNELS.MASK[dbit][0]] = (valD & (1 << dbit)) >> dbit;
      }
    }
  }

  if (mskA > 0) {
    var analogSamples = toArray(buffer.slice(analogSliceLocation)); //slice at analog data location.
    var sampleNr = 0;
    for (var abit in C.ANALOG_CHANNELS.MASK) {
      if ((mskA & (1 << abit)) >> abit) {
        var valA = (analogSamples[sampleNr*2] << 8) | analogSamples[sampleNr*2+1];
        // Convert to mV, resolition is < 1mV, so rounding is OK
        frame.analogSamples[C.ANALOG_CHANNELS.MASK[abit][0]] = Math.round((valA * 1200) / 1023);
        sampleNr++;
      }
    }
  }
};

// Series 1 Support
frame_parser.Recieved16BitPacketIO = function(frame, buffer) {
  var hasDigital = 0;
  var data = {};

  data.sampleQuantity = buffer.readUInt8(4);
  data.channelMask    = buffer.readUInt16BE(5);
  data.channels       = {};
  data.analogSamples  = [];
  data.digitalSamples = [];

  //analog channels
  for( var a=0; a<=5; a++ ){
    // exponent looks odd here because analog pins start at 0000001000000000
    if( Boolean(data.channelMask & Math.pow(2,a+9)) ){
      data.channels['ADC'+a] = 1;
    }
  }

  // if any of the DIO pins are active, parse the digital samples 
  // 0x1ff = 0000000111111111
  if(data.channelMask & 0x1ff){
    hasDigital = 1;
    for( var i=0; i < data.sampleQuantity; i++ ){
      data.digitalSamples.push( buffer.readUInt16BE(7+i).toString(2) );
    }

    //digital channels
    for( var d=0; d<=8; d++ ){
      if( Boolean(data.channelMask & Math.pow(2,d)) ){
        data.channels['DIO'+d] = 1;
      }
    }
  }

  var offset=0;
  for( var i=0; i < data.sampleQuantity; i++ ){
    var sample = {};
    for( var j=0; j <= 5; j++ ){
      if( data.channels['ADC'+j] ){
        // starts at the 7th byte and moved down by the Digital Samples section
        sample['ADC'+j] = buffer.readUInt16BE(7+(hasDigital*data.sampleQuantity)+i+offset);
        offset += 2;
      }
    }
    data.analogSamples.push(sample);
  }

  frame.data = data;
}

frame_parser[C.FRAME_TYPE.TX_STATUS] = function(frame, buffer) {
  frame.id = buffer.readUInt8(0);
  frame.deliveryStatus = buffer.readUInt8(1);
};

frame_parser[C.FRAME_TYPE.RX_PACKET_64] = function(frame, buffer) {
  frame.remote64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.rssi = buffer.readUInt8(8);
  frame.receiveOptions = buffer.readUInt8(9);
  frame.data = toArray(buffer.slice(10));
};

frame_parser[C.FRAME_TYPE.RX_PACKET_16] = function(frame, buffer) {
  frame.remote16 = frame_parser.parseAddress(buffer, 0, 2);
  frame.rssi = buffer.readUInt8(2);
  frame.receiveOptions = buffer.readUInt8(3);
  frame.data = toArray(buffer.slice(4));
};

frame_parser[C.FRAME_TYPE.RX_PACKET_64_IO] = function(frame, buffer) {
  frame.remote64 = frame_parser.parseAddress(buffer, 0, 8);
  frame.rssi = buffer.readUInt8(8);
  frame.receiveOptions = buffer.readUInt8(9);
  frame.data = toArray(buffer.slice(10));
  // TODO: Parse I/O Data?
};


frame_parser[C.FRAME_TYPE.RX_PACKET_16_IO] = function(frame, buffer) {
  frame.remote16       = frame_parser.parseAddress(buffer, 0, 2);
  frame.rssi           = buffer.readUInt8(2);
  frame.receiveOptions = buffer.readUInt8(3);
  frame_parser.Recieved16BitPacketIO(frame, buffer);
};
