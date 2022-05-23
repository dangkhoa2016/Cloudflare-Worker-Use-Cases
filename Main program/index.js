const servers = {
  rails: TOKEN_SERVER_RAILS,
  nodejs: TOKEN_SERVER_NODEJS,
  netcore: TOKEN_SERVER_NETCORE,
};
const thumbnailNotFoundUrl = 'https://cdn-icons-png.flaticon.com/128/2748/2748614.png';
const max_retry_token = 5;

String.prototype.trim = function (char) {
  if (char) {
    return this.replace(
      new RegExp("^\\" + char + "+|\\" + char + "+$", "g"),
      ''
    );
  }
  return this.replace(/^\s+|\s+$/g, "");
};

/**
 * global functions
 */
const FUNCS = {
  formatSearchKeyword: function (keyword) {
    let nothing = '';
    let space = ' ';
    if (!keyword) return nothing;
    return keyword
      .replace(/(!=)|['"=<>/\\:]/g, nothing)
      .replace(/[,，|(){}]/g, space)
      .trim();
  },
  default7DaysAgo: function () {
    var date = new Date();
    var ago_date = new Date(date);
    ago_date.setDate(ago_date.getDate() - 7);
    return [ago_date, date];
  },
  parseDate(date_str) {
    var date = null;
    if (date_str) {
      try {
        date = new Date(date_str);
        if (isNaN(date)) {
          var d = Date.parse(date_str);
          date = new Date(d);
        }
      } catch (ex) {
        console.log('Error parse date', ex, date_str);
      }
    }
    return date;
  },
  sameDates(from_date, to_date) {
    if (!from_date || !to_date) {
      console.log('from_date or to_date is null.');
      return true;
    }
    if (typeof (from_date.valueOf()) !== 'number' || typeof (to_date.valueOf()) !== 'number') {
      console.log('from_date or to_date is not a Date.');
      return true;
    }

    from_date.setHours(from_date.getHours() + 1);
    return (from_date > to_date);
  },
};

/**
 * global consts
 */
const CONSTS = new (class {
  constructor() {
    this.google_powerpoint = 'application/vnd.google-apps.presentation'
    this.google_word = 'application/vnd.google-apps.document';
    this.google_excel = 'application/vnd.google-apps.spreadsheet';
    this.google_docs = `${this.google_powerpoint},${this.google_word},${this.google_excel}`;
  }
  default_file_fields =
    'id,name,mimeType,modifiedTime,createdTime,description,size,thumbnailLink,imageMediaMetadata,videoMediaMetadata,owners/displayName';
  folder_mime_type = 'application/vnd.google-apps.folder';
  archive_mime_type = 'application/x-gzip,application/x-tar,application/x-rar,application/x-compressed,application/x-zip-compressed';
  office_mime_type = 'application/vnd.oasis.opendocument.presentation,application/vnd.openxmlformats-officedocument.presentationml.presentation' +
    ',application/pdf,application/vnd.oasis.opendocument.text,application/vnd.openxmlformats-officedocument.wordprocessingml.document' +
    ',application/x-vnd.oasis.opendocument.spreadsheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' +
    ',application/msword,application/rtf';
})();


addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

function renderIndexPage() {
  return new Response('<h1>Welcome !</h1>', {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    },
  });
};

function renderNotFound(ex) {
  return new Response(ex || 'Not Found', {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    },
  });
};

function renderError(ex) {
  return new Response(ex || 'Internal Server Error', {
    status: 500,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    },
  });
};

function renderUnprocessableEntity(ex) {
  return new Response(ex || 'Unprocessable Entity', {
    status: 422,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    },
  });
};

function renderJson(json) {
  return new Response(JSON.stringify(json), {
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    },
  });
};

class CustomSearch {
  constructor() {
    this.api_key = CUSTOM_SEARCH_API_KEY;
    this.custom_search_movie_info = CUSTOM_SEARCH_MOVIE_INFO;
    this.custom_search_movie_trailer = CUSTOM_SEARCH_MOVIE_TRAILER;
    this.base_url = 'https://www.googleapis.com/customsearch/v1/siterestrict';
  }

  async get_movie_info(name) {
    const url = `${this.base_url}?key=${this.api_key}&cx=${this.custom_search_movie_info}&q=${name}&num=1`;
    // console.log(url);

    try {
      let response = await fetch(url, {
        headers: {
          'content-type': 'application/json;charset=UTF-8',
        }
      });
      const results = await response.json();
      const { items = [] } = results || {};
      if (items.length > 0)
        return items[0];
    } catch (ex) {
      console.log('Error search web', ex);
    }
  }

  async get_movie_trailer(name) {
    const url = `${this.base_url}?key=${this.api_key}&cx=${this.custom_search_movie_trailer}&q=${name}&num=1`;
    // console.log(url);

    try {
      let response = await fetch(url, {
        headers: {
          'content-type': 'application/json;charset=UTF-8',
        }
      });
      const results = await response.json();
      const { items = [] } = results || {};
      if (items.length > 0)
        return items[0];
    } catch (ex) {
      console.log('Error search web', ex);
    }
  }
};

class GoogleDrive {
  constructor() {
    this.order = 'folder,name,modifiedTime desc';
    this.root = DRIVE_ROOT_FOLDER_ID;
    // this.driveId = TEAM_DRIVE_ID;
    this.server_name = '';
    this.page_size = 10;
    // this.init();
  }

  empty_result() {
    return {
      nextPageToken: null,
      files: [],
    }
  }

  async down(id, range = '', inline = false) {
    if (!id) {
      console.log('No id provided.');
      return renderUnprocessableEntity('No id provided.');
    }
    const info = await this.getInfo(id);
    if (!info)
      return renderNotFound(`File [${id}] does not exist or is inaccessible.`);
    // if (CONSTS.google_docs.split(',').indexOf(info.mimeType) !== -1) {
    //   return renderJson({
    //     error: 'Not support.'
    //   });
    // }
    var not_image_or_video = info.mimeType.indexOf('image/') < 0 && info.mimeType.indexOf('video/') < 0;
    if (not_image_or_video && inline === true && info.size > 5 * 1024 * 1024)
      return renderJson({
        error: 'File is too large.'
      });

    let downloadType = '?alt=media';
    if (info.mimeType === CONSTS.google_excel)
      downloadType = '/export?mimeType=text/csv';
    if (info.mimeType === CONSTS.google_word)
      downloadType = '/export?mimeType=text/html';
    if (info.mimeType === CONSTS.google_powerpoint)
      downloadType = '/export?mimeType=text/html';
    let url = `https://www.googleapis.com/drive/v3/files/${id}${downloadType}`;
    let requestOption = await this.requestOption();
    requestOption.headers['Range'] = range || '';
    let res = await fetch(url, requestOption);
    const {
      headers
    } = (res = new Response(res.body, res));
    headers.append('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', '*');

    // Set cache control headers to cache on browser for 25 minutes
    headers.set('Cache-Control', 'max-age=1500');

    headers.set('Content-Disposition', inline ? `inline;filename=${info.name}` : `attachment;filename=${info.name}`);
    return res;
  }

  async _file(parent_id, name) {
    name = decodeURIComponent(name).replace(/\'/g, "\\'");
    let url = 'https://www.googleapis.com/drive/v3/files';
    let params = {
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    };
    params.q = `'${parent}' in parents and name = '${name}' and trashed = false`;
    params.fields = `files(${CONSTS.default_file_fields})`;
    url += '?' + this.enQuery(params);
    let requestOption = await this.requestOption();
    let response = await fetch(url, requestOption);
    let obj = await response.json();
    return obj.files[0];
  }

  async listFilesOnly(page_size = 0, page_token = null, order_by = '', fields = '') {
    const query = ` (mimeType != '${CONSTS.folder_mime_type}')`;
    return await this.baseSearch(`trashed = false and ${query}`, page_size, page_token, order_by, fields);
  }

  async searchInFolder(parent_id, page_size = 0, page_token = null, order_by = '', fields = '', type = '') {
    if (!parent_id)
      parent_id = this.root;
    if (!parent_id) {
      console.log('No [parent_id] provide.');
      return renderUnprocessableEntity('No [parent_id] provide.');
    }

    type = type || '';
    if (type.toLowerCase() === 'folder')
      type = ` and (mimeType = '${CONSTS.folder_mime_type}')`;
    else if (type.toLowerCase() === 'file')
      type = ` and (mimeType != '${CONSTS.folder_mime_type}')`;
    else
      type = '';

    return await this.baseSearch(`'${parent_id}' in parents and trashed = false${type}`, page_size, page_token, order_by, fields);
  }

  async searchByName(origin_keyword, page_size = 0, page_token = null, order_by = '', fields = '') {
    let keyword = FUNCS.formatSearchKeyword(origin_keyword);
    if (!keyword) {
      console.log('Prevent search empty keyword.');
      return this.empty_result();
    }
    /*
    let words = keyword.split(/[\s|.|\-]+/).filter(x => x);
    let name_search_str = `name contains '${words.join("' AND name contains '")}'`;
    */
    let name_search_str = `fullText contains '${keyword}'`;
    return await this.baseSearch(`trashed = false AND (${name_search_str})`, page_size, page_token, ' ', fields);
  }

  async searchByStarred(page_size = 0, page_token = null, order_by = '', fields = '') {
    let search_str = `starred = true`;
    return await this.baseSearch(`trashed = false AND (${search_str})`, page_size, page_token, '', fields);
  }

  async thumbnail(id, web_size) {
    if (!id) {
      console.log('No id provided.');
      return renderUnprocessableEntity('No id provided.');
    }
    const info = await this.getInfo(id);
    if (!info)
      return renderNotFound(`File [${id}] does not exist or is inaccessible.`);

    try {
      let requestOption = await this.requestOption();
      const url = `https://drive.google.com/thumbnail?id=${id}${web_size ? ('&sz=' + web_size) : ''}`;
      // console.log('thumbnail', url);
      let res = await fetch(url, requestOption);
      const {
        headers, status,
      } = (res = new Response(res.body, res));

      if (status === 200) {
        headers.append('Access-Control-Allow-Origin', '*');
        // headers.set('Content-Disposition', inline ? 'inline' : `attachment;filename=${info.name}`);
        return res;
      }
    } catch (ex) {
      console.log('Error load thumbnail', ex);
    }

    return fetch(THUMBNAIL_NOT_FOUND || thumbnailNotFoundUrl);
  }

  async searchByUser(email, page_size = 0, page_token = null, order_by = '', fields = '') {
    if (!email) {
      console.log('Prevent search empty email.');
      return this.empty_result();
    }

    return await this.baseSearch(`trashed = false AND ('${email}' in owners)`, page_size, page_token, order_by, fields);
  }

  async baseSearch(query, page_size = 0, page_token = null, order_by = '', fields = '') {
    let params = {
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    };

    if (!page_size || page_size < 1 || page_size > 300)
      page_size = this.page_size;

    params.q = query;
    params.pageSize = page_size;
    // if use share team drive
    // params.corpora = 'drive';
    // params.driveId = this.driveId;
    // if use share user drive
    params.corpora = 'user';
    params.fields = `nextPageToken, files(${fields || CONSTS.default_file_fields})`;
    params.orderBy = order_by || this.order;
    params.pageToken = page_token || '';

    let url = 'https://www.googleapis.com/drive/v3/files';
    url += '?' + this.enQuery(params);
    let requestOption = await this.requestOption();
    let response = await fetch(url, requestOption);
    let res_obj = await response.json();

    /*do {
      if (pageToken) {
          params.pageToken = pageToken;
      }
      let url = 'https://www.googleapis.com/drive/v3/files';
      url += '?' + this.enQuery(params);
      let requestOption = await this.requestOption();
      let response = await fetch(url, requestOption);
      obj = await response.json();
      files.push(...obj.files);
      pageToken = obj.nextPageToken;
    } while (pageToken);*/

    return {
      nextPageToken: res_obj.nextPageToken || null,
      files: res_obj.files,
    };
  }

  async getToken(server_name, retry = false) {
    if (!server_name)
      server_name = this.randomServer();
    //get server
    var server = servers[server_name];
    if (!server)
      server = servers[this.randomServer()];

    var token = null;
    try {
      var full_url = `${server}/token/random`;
      var response = await fetch(full_url);
      if (response.status === 200)
        token = await response.text();
    } catch (err) {
      console.log('Error get token', err);
    }

    if (!token && retry !== true)
      token = await this.getToken(server_name, true);

    return token;
  }

  async fetchAccessToken(server_name) {
    var token = null;
    var number_try = 0;
    while (number_try < max_retry_token && !token) {
      token = await this.getToken(server_name);
      number_try += 1;
    }

    return token;
  }

  async requestOption(headers = {}, method = 'GET') {
    const accessToken = await this.fetchAccessToken(this.server_name);
    headers['authorization'] = 'Bearer ' + accessToken;
    return {
      method: method,
      headers: headers
    };
  }

  async getInfo(id, fields = '') {
    let params = {
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: fields || CONSTS.default_file_fields
    };

    let url = `https://www.googleapis.com/drive/v3/files/${id}?${this.enQuery(params)}`;
    try {
      let requestOption = await this.requestOption();
      let response = await fetch(url, requestOption);
      return await response.json();
    } catch (ex) {
      console.log('Error getInfo', ex);
    }
  }

  randomServer() {
    const keys = Object.keys(servers);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  enQuery(data) {
    const ret = [];
    for (let d in data) {
      ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    }
    return ret.join('&');
  }
};

var gd = new GoogleDrive();
var cs = new CustomSearch();

async function handleHomeListing(type, page_size = 10, filter_field, from_date, to_date) {
  type = type || '';
  filter_field = filter_field || 'createdTime';
  let data = [];
  var f_date = FUNCS.parseDate(from_date);
  var t_date = FUNCS.parseDate(to_date);
  if (FUNCS.sameDates(f_date, t_date)) {
    [f_date, t_date] = FUNCS.default7DaysAgo();
  }

  const query_date = `${filter_field} >= '${f_date.toISOString()}' and ${filter_field} <= '${t_date.toISOString()}'`;
  let query = '';
  switch (type.toLowerCase()) {
    case 'folders':
      query = `${query_date} and mimeType = '${CONSTS.folder_mime_type}'`;
      break;
    case 'videos':
      query = `${query_date} and mimeType contains 'video/'`;
      break;
    case 'images':
      query = `${query_date} and mimeType contains 'image/'`;
      break;
    case 'plains':
      query = `${query_date} and mimeType contains 'text/'`;
      break;
    case 'archives':
      mimes = CONSTS.archive_mime_type.split(',').filter(f => f).map(t => `mimeType = '${t}'`);
      query = `${query_date} and (${mimes.join(' or ')})`;
      break;
    case 'offices':
      mimes = (CONSTS.office_mime_type + ',' + CONSTS.google_docs).split(',').filter(f => f).map(t => `mimeType = '${t}'`);
      query = `${query_date} and (${mimes.join(' or ')})`;
      break;
    default:
      break;
  }

  if (query)
    data = await gd.baseSearch(query, page_size, null, `${filter_field} desc`, '');

  return renderJson(data || []);
};

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleRequest(request) {
  const {
    pathname,
    searchParams
  } = new URL(request.url);
  let path = decodeURI(pathname);

  //demo only
  gd.server_name = searchParams.get('server');

  if (path === '/') return renderIndexPage();
  else if (path.toLowerCase().indexOf('/favicon.ico') === 0) {
    return fetch('https://cdn.glitch.com/fdc9a692-7a19-460f-81a9-91b78cb81283%2Fgoogle1.ico?v=1625912861771');
  }

  switch (path.toLowerCase()) {
    case '/search':
      try {
        return renderJson(await gd.searchByName(searchParams.get('keyword'), searchParams.get('page_size'), searchParams.get('page_token'), searchParams.get('order_by'), searchParams.get('fields')));
      } catch (ex) {
        console.log('Error list', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/in_folder':
      try {
        return renderJson(await gd.searchInFolder(searchParams.get('id'), searchParams.get('page_size'), searchParams.get('page_token'), searchParams.get('order_by'), searchParams.get('fields'), searchParams.get('type')));
      } catch (ex) {
        console.log('Error list in_folder', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/files':
      try {
        return renderJson(await gd.listFilesOnly(searchParams.get('page_size'), searchParams.get('page_token'), searchParams.get('order_by'), searchParams.get('fields')));
      } catch (ex) {
        console.log('Error list files', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/by_user':
      try {
        return renderJson(await gd.searchByUser(searchParams.get('email'), searchParams.get('page_size'), searchParams.get('page_token'), searchParams.get('order_by'), searchParams.get('fields')));
      } catch (ex) {
        console.log('Error list', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/download':
      try {
        return await gd.down(searchParams.get('id'), request.headers.get('Range'));
      } catch (ex) {
        console.log('Error download', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/info':
      try {
        return renderJson(await gd.getInfo(searchParams.get('id'), searchParams.get('fields')));
      } catch (ex) {
        console.log('Error getInfo', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/view':
      try {
        return await gd.down(searchParams.get('id'), request.headers.get('Range'), true);
      } catch (ex) {
        console.log('Error view', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/starred':
      try {
        return await gd.searchByStarred(searchParams.get('page_size'), searchParams.get('page_token'), searchParams.get('order_by'), searchParams.get('fields'));
      } catch (ex) {
        console.log('Error starred', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/thumbnail':
      try {
        return await gd.thumbnail(searchParams.get('id'), searchParams.get('sz'));
      } catch (ex) {
        console.log('Error thumbnail', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/home':
      try {
        return await handleHomeListing(searchParams.get('type'), searchParams.get('page_size'), searchParams.get('order_by'), searchParams.get('from_date'), searchParams.get('to_date'));
      } catch (ex) {
        console.log('Error home', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/movie_info':
      try {
        return renderJson(await cs.get_movie_info(searchParams.get('name')));
      } catch (ex) {
        console.log('Error movie_info', ex);
        return renderError('Something went wrong.');
      }

      break;
    case '/movie_trailer':
      try {
        return renderJson(await cs.get_movie_trailer(searchParams.get('name')));
      } catch (ex) {
        console.log('Error movie_trailer', ex);
        return renderError('Something went wrong.');
      }

      break;
    default:
      return renderNotFound();
      break;
  }
}
