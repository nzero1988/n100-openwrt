'use strict';
'require view';
'require rpc';
'require fs';
'require uci';
'require poll';

var boardCall = rpc.declare({ object: 'system', method: 'board', expect: {} });
var infoCall = rpc.declare({ object: 'system', method: 'info', expect: {} });
var wanCall = rpc.declare({ object: 'network.interface.wan', method: 'status', expect: {} });
var lanCall = rpc.declare({ object: 'network.interface.lan', method: 'status', expect: {} });
var deviceCall = rpc.declare({ object: 'network.device', method: 'status', params: ['name'], expect: {} });

function text(value) { return value == null || value === '' ? '—' : String(value); }
function address(data) { return (data['ipv4-address'] || []).map(function(a) { return a.address + '/' + a.mask; }).join(', ') || '未获取 IPv4'; }
function uptime(seconds) { seconds = Math.max(0, Number(seconds) || 0); return Math.floor(seconds / 86400) + ' 天 ' + Math.floor(seconds % 86400 / 3600) + ' 小时 ' + Math.floor(seconds % 3600 / 60) + ' 分钟'; }
function kv(label, value) { return E('div', { 'class': 'ow-kv' }, [ E('span', {}, label), E('span', {}, text(value)) ]); }
function link(label, path) { return E('a', { href: L.url.apply(L, path.split('/')) }, label); }

return view.extend({
  load: function() {
    return Promise.all([
      L.resolveDefault(boardCall(), {}), L.resolveDefault(infoCall(), {}),
      L.resolveDefault(wanCall(), {}), L.resolveDefault(lanCall(), {}),
      L.resolveDefault(fs.read('/etc/n100-build-id'), ''),
      L.resolveDefault(uci.load('n100-update'), null)
    ]);
  },
  render: function(data) {
    if (!document.querySelector('link[data-orangewrt-dashboard]'))
      document.head.appendChild(E('link', { rel: 'stylesheet', href: L.resource('..') + '/orangewrt/theme.css', 'data-orangewrt-dashboard': '' }));
    var board = data[0], info = data[1], wan = data[2], lan = data[3];
    var down = E('span', {}, '等待采样'), up = E('span', {}, '等待采样');
    var memory = E('span'), load = E('span'), running = E('span', {}, uptime(info.uptime));
    var last = null, history = [], wanDevice = wan.l3_device || wan.device;
    var downloadLine = E('path', { 'class': 'ow-chart-line' });
    var uploadLine = E('path', { 'class': 'ow-chart-upload' });
    var ns = 'http://www.w3.org/2000/svg';
    var chart = document.createElementNS(ns, 'svg');
    chart.setAttribute('viewBox', '0 0 600 180'); chart.setAttribute('preserveAspectRatio', 'none');
    chart.setAttribute('class', 'ow-chart'); chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', 'WAN 实时速率，实线下载，虚线上传。采样后显示。');
    function svgPath(cls) { var p = document.createElementNS(ns, 'path'); p.setAttribute('class', cls); return p; }
    downloadLine = svgPath('ow-chart-line'); uploadLine = svgPath('ow-chart-upload');
    var grid = svgPath('ow-chart-grid'); grid.setAttribute('d', 'M0 20H600 M0 90H600 M0 160H600');
    chart.appendChild(grid); chart.appendChild(downloadLine); chart.appendChild(uploadLine);
    var ceiling = E('span', {}, '等待速率采样');
    function setInfo(value) {
      var m = value.memory || {}, total = Number(m.total) || 0;
      var used = Math.max(0, total - (Number(m.available) || (Number(m.free) || 0) + (Number(m.buffered) || 0) + (Number(m.cached) || 0)));
      memory.textContent = total ? (used / 1073741824).toFixed(1) + ' / ' + (total / 1073741824).toFixed(1) : '—';
      load.textContent = value.load && value.load.length ? (value.load[0] / 65536).toFixed(2) : '—';
      running.textContent = uptime(value.uptime);
    }
    function sample(device) {
      var stats = device.statistics;
      if (!stats || !Number.isFinite(Number(stats.rx_bytes)) || !Number.isFinite(Number(stats.tx_bytes))) {
        down.textContent = up.textContent = '暂不可用'; return;
      }
      var now = { time: Date.now(), rx: Number(stats.rx_bytes), tx: Number(stats.tx_bytes) };
      if (last && now.time > last.time && now.rx >= last.rx && now.tx >= last.tx) {
        var seconds = (now.time - last.time) / 1000;
        var rx = (now.rx - last.rx) * 8 / seconds / 1000000;
        var tx = (now.tx - last.tx) * 8 / seconds / 1000000;
        down.textContent = rx.toFixed(2); up.textContent = tx.toFixed(2);
        history.push([rx, tx]); if (history.length > 30) history.shift();
        var max = Math.max.apply(Math, [1].concat(history.reduce(function(a, p) { return a.concat(p); }, []))) * 1.1;
        function path(index) { return history.map(function(p, i) { return (i ? 'L' : 'M') + (history.length > 1 ? i * 600 / (history.length - 1) : 0).toFixed(2) + ' ' + (160 - p[index] / max * 140).toFixed(2); }).join(' '); }
        downloadLine.setAttribute('d', path(0)); uploadLine.setAttribute('d', path(1));
        ceiling.textContent = '纵轴 0～' + max.toFixed(1) + ' Mbps';
      }
      last = now;
    }
    setInfo(info);
    var enabled = uci.get('n100-update', 'main', 'enabled');
    var repository = uci.get('n100-update', 'main', 'repository');
    function card(label, value, unit, detail) {
      return E('article', { 'class': 'ow-card' }, [ E('div', { 'class': 'ow-label' }, label), E('div', { 'class': 'ow-value' }, [ value, E('span', { 'class': 'ow-unit' }, unit) ]), E('div', { 'class': 'ow-detail' }, detail) ]);
    }
    var root = E('div', { 'class': 'ow-real' }, [
      E('div', { 'class': 'ow-heading' }, [ E('div', {}, [ E('h2', {}, 'OrangeWrt · 网络总览'), E('p', { 'class': 'ow-subtitle' }, text(board.hostname) + ' · ' + text(board.model) + ' · 实际设备数据') ]), E('div', { 'class': 'ow-chip' }, data[4].trim() || (board.release || {}).description || 'OpenWrt') ]),
      E('div', { 'class': 'ow-grid' }, [ card('WAN 下载', down, 'Mbps', '每 3 秒采样，首次需等待'), card('WAN 上传', up, 'Mbps', '按网口字节增量计算'), card('内存使用', memory, 'GB', '可用内存口径，包含缓存修正'), card('1 分钟负载', load, '', '负载不是 CPU 使用百分比') ]),
      E('div', { 'class': 'ow-columns' }, [
        E('article', { 'class': 'ow-panel' }, [ E('h3', {}, 'WAN 流量趋势'), chart, E('div', { 'class': 'ow-chart-labels' }, [ E('span', {}, '实线：下载 · 虚线：上传'), ceiling ]), E('p', { 'class': 'ow-note' }, '仅显示打开本页面后的采样，最多保留最近 30 个点。') ]),
        E('article', { 'class': 'ow-panel' }, [ E('h3', {}, '网络链路'), kv('WAN 状态', wan.up ? '已连接' : '未连接'), kv('WAN IPv4', address(wan)), kv('LAN IPv4', address(lan)), kv('运行时间', running), E('div', { 'class': 'ow-links' }, [link('网络与接口', 'admin/network/network'), link('系统日志', 'admin/status/syslog')]) ])
      ]),
      E('div', { 'class': 'ow-columns' }, [
        E('article', { 'class': 'ow-panel' }, [ E('h3', {}, '代理与服务'), E('p', { 'class': 'ow-subtitle' }, '进入插件查看实际状态、配置节点和订阅；日常只启用一套透明代理。'), E('div', { 'class': 'ow-links' }, [ link('OpenClash', 'admin/services/openclash'), link('SSR Plus+', 'admin/services/shadowsocksr') ]) ]),
        E('article', { 'class': 'ow-panel' }, [ E('h3', {}, '固件与自动更新'), kv('自动更新', enabled == null ? '未配置' : enabled === '1' ? '已启用' : '已暂停'), kv('检查计划', enabled == null ? '—' : '每周日 04:00 · 北京时间'), kv('更新来源', repository || '未配置'), E('div', { 'class': 'ow-links' }, [link('备份与升级', 'admin/system/flash'), link('选择界面风格', 'admin/system/system')]), E('p', { 'class': 'ow-note' }, '本页面只读取状态，不会发起升级或修改网络。') ])
      ])
    ]);
    poll.add(function() {
      return Promise.all([ L.resolveDefault(infoCall(), {}), wanDevice ? L.resolveDefault(deviceCall(wanDevice), {}) : Promise.resolve({}) ]).then(function(values) { setInfo(values[0]); sample(values[1]); });
    }, 3);
    return root;
  },
  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
