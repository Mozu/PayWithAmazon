
// Polyfill for TextEncoder if it doesn't exist
if (typeof TextEncoder === 'undefined') {
    console.log('Polyfilling TextEncoder');
    var TextEncoderPolyfill = function TextEncoder() {};
    TextEncoderPolyfill.prototype.encode = function encode(str) {
        var length = str.length;
        var res = [];
        for (var i = 0; i < length; i++) {
            var point = str.charCodeAt(i);
            if (point <= 0x007f) {
                res.push(point);
            } else if (point <= 0x07ff) {
                res.push(0xc0 | (point >>> 6));
                res.push(0x80 | (point & 0x3f));
            } else if (point <= 0xffff) {
                if ((point & 0xfc00) === 0xd800 && i + 1 < length) {
                    var next = str.charCodeAt(i + 1);
                    if ((next & 0xfc00) === 0xdc00) {
                        point = 0x10000 + ((point - 0xd800) << 10) + (next - 0xdc00);
                        i++;
                        res.push(0xf0 | (point >>> 18));
                        res.push(0x80 | ((point >>> 12) & 0x3f));
                        res.push(0x80 | ((point >>> 6) & 0x3f));
                        res.push(0x80 | (point & 0x3f));
                        continue;
                    }
                }
                res.push(0xe0 | (point >>> 12));
                res.push(0x80 | ((point >>> 6) & 0x3f));
                res.push(0x80 | (point & 0x3f));
            } else {
                res.push(0xef);
                res.push(0xbf);
                res.push(0xbd);
            }
        }
        return new Uint8Array(res);
    };
    
    // Export to global scope
    if (typeof global !== 'undefined') {
        global.TextEncoder = TextEncoderPolyfill;
    } else if (typeof window !== 'undefined') {
        window.TextEncoder = TextEncoderPolyfill;
    } else if (typeof self !== 'undefined') {
        self.TextEncoder = TextEncoderPolyfill;
    } else {
        this.TextEncoder = TextEncoderPolyfill;
    }
}
