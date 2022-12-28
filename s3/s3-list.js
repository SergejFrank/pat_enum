// https://tc39.github.io/ecma262/#sec-array.prototype.includes
if (!Array.prototype.includes) {
  Object.defineProperty(Array.prototype, 'includes', {
    value: function (searchElement, fromIndex) {

      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }

      // 1. Let O be ? ToObject(this value).
      var o = Object(this);

      // 2. Let len be ? ToLength(? Get(O, "length")).
      var len = o.length >>> 0;

      // 3. If len is 0, return false.
      if (len === 0) {
        return false;
      }

      // 4. Let n be ? ToInteger(fromIndex).
      //    (If fromIndex is undefined, this step produces the value 0.)
      var n = fromIndex | 0;

      // 5. If n ≥ 0, then
      //  a. Let k be n.
      // 6. Else n < 0,
      //  a. Let k be len + n.
      //  b. If k < 0, let k be 0.
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

      function sameValueZero(x, y) {
        return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));
      }

      // 7. Repeat, while k < len
      while (k < len) {
        // a. Let elementK be the result of ? Get(O, ! ToString(k)).
        // b. If SameValueZero(searchElement, elementK) is true, return true.
        if (sameValueZero(o[k], searchElement)) {
          return true;
        }
        // c. Increase k by 1. 
        k++;
      }

      // 8. Return false
      return false;
    }
  });
}

jQuery(function ($) { getS3Data(); });

function getS3Data(marker, html) {
  var s3_rest_url = createS3QueryUrl(marker);
  // set loading notice
  $('#listing').html('loading ....');
  $.get(s3_rest_url)
    .done(function (data) {
      // clear loading notice
      $('#listing').html('');
      var xml = $(data);
      var info = getInfoFromS3Data(xml);

      buildNavigation(info);

      // Add a <base> element to the document head to make relative links
      // work even if the URI does not contain a trailing slash
      var base = window.location.href
      base = (base.endsWith('/')) ? base : base + '/';
      $('head').append('<base href="' + base + '">');

      html = typeof html !== 'undefined' ? html + prepareTable(info) :
        prepareTable(info);
      if (info.nextMarker != "null") {
        getS3Data(info.nextMarker, html);
      } else {
        document.getElementById('listing').innerHTML =
          '<pre>' + html + '</pre>';
      }
    })
    .fail(function (error) {
      console.error(error);
      $('#listing').html('<strong>Error: ' + error + '</strong>');
    });
}

function buildNavigation(info) {
  var baseUrl = "?bucket=" + params.get("bucket") + '&prefix=';
  var root = '<a href="' + baseUrl + '">' + BUCKET_URL + '</a> / ';
  if (info.prefix) {
    var processedPathSegments = '';
    var content = $.map(info.prefix.split('/'), function (pathSegment) {
      processedPathSegments =
        processedPathSegments + encodeURIComponent(pathSegment) + '/';
      return '<a href="' + baseUrl + processedPathSegments.replace(/"/g, '&quot;') + '">' +
        pathSegment + '</a>';
    });
    $('#navigation').html(root + content.join(' / '));
  } else {
    $('#navigation').html(root);
  }
}

function createS3QueryUrl(marker) {
  var s3_rest_url = BUCKET_URL;
  s3_rest_url += '?delimiter=/';


  var rx = '.*[?&]prefix=([^&]+)(&.*)?$';
  var prefix = '';

  var match = location.search.match(rx);
  if (match) {
    prefix = match[1];
  } 
  if (prefix) {
    // make sure we end in /
    var prefix = prefix.replace(/\/$/, '') + '/';
    s3_rest_url += '&prefix=' + prefix;
  }
  if (marker) {
    s3_rest_url += '&marker=' + marker;
  }

  cors_bypass_url = "https://api.codetabs.com/v1/proxy/?quest="

  return cors_bypass_url + s3_rest_url;
}

function getInfoFromS3Data(xml) {
  var prefix = $(xml.find('Prefix')[0]).text();
  var files = $.map(xml.find('Contents'), function (item) {
    item = $(item);
    // clang-format off
    return {
      Key: item.find('Key').text(),
      LastModified: item.find('LastModified').text(),
      Size: bytesToHumanReadable(item.find('Size').text()),
      Type: 'file'
    }
    // clang-format on
  });
  if (prefix && files[0] && files[0].Key == prefix) {
    files.shift();
  }
  var directories = $.map(xml.find('CommonPrefixes'), function (item) {
    item = $(item);
    // clang-format off
    return {
      Key: item.find('Prefix').text(),
      LastModified: '',
      Size: '0',
      Type: 'directory'
    }
    // clang-format on
  });
  if ($(xml.find('IsTruncated')[0]).text() == 'true') {
    var nextMarker = $(xml.find('NextMarker')[0]).text();
  } else {
    var nextMarker = null;
  }
  // clang-format off
  return {
    files: files,
    directories: directories,
    prefix: prefix,
    nextMarker: encodeURIComponent(nextMarker)
  }
}


function prepareTable(info) {
  var files = info.directories.concat(info.files), prefix = info.prefix;
  var cols = [45, 30, 15];
  var content = [];
  content.push(padRight('Last Modified', cols[1]) + '  ' +
    padRight('Size', cols[2]) + 'Key \n');
  content.push(new Array(cols[0] + cols[1] + cols[2] + 4).join('-') + '\n');

  // add ../ at the start of the dir listing, unless we are already at root dir
  if (prefix && prefix !== "") {
    var up = prefix.replace(/\/$/, '').replace(/"/g, '&quot;').split('/').slice(0, -1).concat('').join(
      '/'),  // one directory up
      item =
      {
        Key: up,
        LastModified: '',
        Size: '',
        keyText: '../',
        href: "?bucket=" + params.get("bucket") +'&prefix=' + up 
      },
      row = renderRow(item, cols);


    content.push(row + '\n');
  }

  jQuery.each(files, function (idx, item) {
    // strip off the prefix
    item.keyText = item.Key.substring(prefix.length);
    if (item.Type === 'directory') {
      item.href = location.protocol + '//' + location.hostname +
        location.pathname + "?bucket=" + params.get("bucket") + '&prefix=' + encodePath(item.Key);
    } else {
      item.href = BUCKET_URL + '/' + encodePath(item.Key);
    }

    var row = renderRow(item, cols);
    content.push(row + '\n');
  });

  return content.join('');
}

// Encode everything but "/" which are significant in paths and to S3
function encodePath(path) {
  return encodeURIComponent(path).replace(/%2F/g, '/')
}

function renderRow(item, cols) {
  var row = '';
  row += padRight(item.LastModified, cols[1]) + '  ';
  row += padRight(item.Size, cols[2]);
  row += '<a href="' + item.href + '">' + item.keyText + '</a>';
  return row;
}

function padRight(padString, length) {
  var str = padString.slice(0, length - 3);
  if (padString.length > str.length) {
    str += '...';
  }
  while (str.length < length) {
    str = str + ' ';
  }
  return str;
}

function bytesToHumanReadable(sizeInBytes) {
  var i = -1;
  var units = [' kB', ' MB', ' GB'];
  do {
    sizeInBytes = sizeInBytes / 1024;
    i++;
  } while (sizeInBytes > 1024);
  return Math.max(sizeInBytes, 0.1).toFixed(1) + units[i];
}

