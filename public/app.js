import { MODES, fieldAllowed, isNsModel, dramaLimits, dramaModels, dramaModelForRegion, EC_ASSET_TYPES, EC_VOICES } from '/schema.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  });
  kids.flat().forEach((c) => n.append(c?.nodeType ? c : document.createTextNode(String(c))));
  return n;
};

const state = {
  mode: 'reference2video',
  // 每个模式的值单独保存，切换 tab 不丢失
  values: {}, // { mode: { fieldName: value } }
  pollTimer: null,
  pollTaskId: null,
  pollStart: 0,
};

// ---------- 站点（国内 cn / 海外 com）+ 按站点区分的 API Key ----------
const regionSelect = $('#region');
regionSelect.value = localStorage.getItem('vidu_region') || 'cn';

const apiKeyInput = $('#apiKey');
const keyStoreKey = (region) => `vidu_api_key_${region}`;
function loadKeyForRegion(region) {
  // 迁移：旧版单一 key（vidu_api_key）作为国内 key 的初始值
  const legacy = localStorage.getItem('vidu_api_key') || '';
  return localStorage.getItem(keyStoreKey(region)) ?? (region === 'cn' ? legacy : '') ?? '';
}
apiKeyInput.value = loadKeyForRegion(regionSelect.value);
const siteLabel = (r) => (r === 'com' ? '海外 api.vidu.com' : '国内 api.vidu.cn');
const refreshKeyPlaceholder = () => { apiKeyInput.placeholder = `${siteLabel(regionSelect.value)} 的 Token`; };
refreshKeyPlaceholder();
apiKeyInput.addEventListener('input', () => {
  // 保存到当前所选站点对应的 key
  localStorage.setItem(keyStoreKey(regionSelect.value), apiKeyInput.value);
});
$('#toggleKey').addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

regionSelect.addEventListener('change', () => {
  localStorage.setItem('vidu_region', regionSelect.value);
  // 切换站点时载入该站点自己的 key
  apiKeyInput.value = loadKeyForRegion(regionSelect.value);
  refreshKeyPlaceholder();
  // drama 模型名随站点切换（国内 ↔ 海外 -ab- 版）
  Object.entries(MODES).forEach(([mode, cfg]) => {
    if (cfg.protocol === 'v3' && state.values[mode]?.model) {
      state.values[mode].model = dramaModelForRegion(state.values[mode].model, regionSelect.value);
    }
  });
  if (MODES[state.mode]?.protocol === 'v3') renderForm();
});
function getRegion() { return regionSelect.value || 'cn'; }

fetch('/api/config').then((r) => r.json()).then((cfg) => {
  const hint = $('#keyHint');
  hint.textContent = cfg.hasServerKey ? '服务端已配置默认 Key' : '';
}).catch(() => {});

// ---------- Tabs ----------
const tabs = $('#tabs');
Object.entries(MODES).forEach(([key, m]) => {
  tabs.append(el('button', {
    class: 'tab' + (key === state.mode ? ' active' : ''),
    'data-mode': key,
    onclick: () => switchMode(key),
  }, m.title));
});

function switchMode(key) {
  saveCurrentValues();
  state.mode = key;
  [...tabs.children].forEach((t) => t.classList.toggle('active', t.dataset.mode === key));
  renderForm();
}

// ---------- 表单渲染 ----------
function defaultsFor(mode) {
  const out = {};
  MODES[mode].fields.forEach((f) => {
    if (f.type === 'images') out[f.name] = (f.min && f.min > 0) ? [{ mode: 'url', value: '' }] : [];
    else if (f.type === 'keyframes') out[f.name] = [emptyKeyframe(), emptyKeyframe()];
    else if (f.type === 'ecassets') out[f.name] = [emptyAsset()];
    else out[f.name] = f.default !== undefined ? f.default : '';
  });
  return out;
}
function emptyKeyframe() { return { key_mode: 'url', key_image: '', prompt: '', duration: 5 }; }
function emptyAsset() { return { type: 'character', name: '', image_uri: '', description: '', voice_id: '' }; }

// visibleWhen 匹配：value 可为单值或数组（数组=其一命中即显示）
function visibleMatch(f, vals) {
  const cur = String(vals[f.visibleWhen.field]);
  const want = f.visibleWhen.value;
  return Array.isArray(want) ? want.map(String).includes(cur) : String(want) === cur;
}

function currentValues() {
  if (!state.values[state.mode]) state.values[state.mode] = defaultsFor(state.mode);
  return state.values[state.mode];
}

function saveCurrentValues() {
  // 值已通过双向绑定写入 state.values，无需额外处理
}

function renderForm() {
  const mode = state.mode;
  const cfg = MODES[mode];
  const vals = currentValues();
  $('#modeTitle').textContent = cfg.title;
  $('#modeDesc').textContent = cfg.desc + '  →  ' + cfg.endpoint;

  const form = $('#paramForm');
  form.innerHTML = '';

  let lastGroup = null;
  const model = vals.model;
  for (const f of cfg.fields) {
    // 当前模型不支持的字段直接隐藏（如 viduq4-preview 不接受 aspect_ratio/style 等）
    if (!fieldAllowed(mode, model, f.name)) continue;
    // 指定仅某些模型可用的字段（如 sounds 仅 viduq4-preview）
    if (f.onlyModels && !f.onlyModels.includes(model)) continue;
    // 场景联动：visibleWhen 不匹配时隐藏（如 drama 的三种素材按 scene 切换）
    if (f.visibleWhen && !visibleMatch(f, vals)) continue;
    if (f.group && f.group !== lastGroup) {
      form.append(el('div', { class: 'group-title' }, f.group));
      lastGroup = f.group;
    }
    form.append(renderField(f, vals));
  }
}

function labelEl(f) {
  return el('label', {}, f.label, f.required ? el('span', { class: 'req' }, '*') : '');
}
function helpEl(f) { return f.help ? el('div', { class: 'help' }, f.help) : ''; }

function renderField(f, vals) {
  const set = (v) => { vals[f.name] = v; };

  if (f.type === 'checkbox') {
    const input = el('input', { type: 'checkbox' });
    input.checked = Boolean(vals[f.name]);
    input.addEventListener('change', () => set(input.checked));
    return el('div', { class: 'field checkbox' }, input, el('label', {}, f.label + (f.help ? '' : '')), helpEl(f));
  }

  if (f.type === 'select') {
    const sel = el('select');
    // regionModels：模型名随站点变化（drama 国内/海外），并校正当前值到本站点变体
    let options = f.options || [];
    if (f.regionModels) {
      options = dramaModels(getRegion());
      const fixed = dramaModelForRegion(vals[f.name], getRegion());
      if (!options.includes(fixed)) vals[f.name] = options[0];
      else vals[f.name] = fixed;
    }
    options.forEach((o) => {
      const value = typeof o === 'object' ? o.value : o;
      const text = typeof o === 'object' ? o.label : o;
      const opt = el('option', { value }, text);
      if (String(vals[f.name]) === String(value)) opt.selected = true;
      sel.append(opt);
    });
    sel.addEventListener('change', () => {
      // 尝试保持数字类型（如 wm_position）
      const raw = sel.value;
      set(/^\d+$/.test(raw) && typeof f.default === 'number' ? Number(raw) : raw);
      // 切换模型/场景/生成方式会影响可用字段集，需重新渲染表单
      if (f.name === 'model' || f.name === 'scene' || f.name === 'generateMode') renderForm();
    });
    return el('div', { class: 'field' }, labelEl(f), sel, helpEl(f));
  }

  if (f.type === 'textarea') {
    const ta = el('textarea', { rows: 3 });
    ta.value = vals[f.name] ?? '';
    ta.addEventListener('input', () => set(ta.value));
    return el('div', { class: 'field' }, labelEl(f), ta, helpEl(f));
  }

  if (f.type === 'number') {
    const input = el('input', { type: 'number' });
    if (f.min !== undefined) input.min = f.min;
    if (f.max !== undefined) input.max = f.max;
    if (f.step !== undefined) input.step = f.step;
    input.value = vals[f.name] ?? '';
    input.addEventListener('input', () => set(input.value === '' ? '' : Number(input.value)));
    return el('div', { class: 'field' }, labelEl(f), input, helpEl(f));
  }

  if (f.type === 'images') return renderImages(f, vals);
  if (f.type === 'keyframes') return renderKeyframes(f, vals);
  if (f.type === 'ecassets') return renderEcAssets(f, vals);

  // text / password（可选 persistKey：值额外持久化到 localStorage，供重载后查询复用）
  const input = el('input', { type: f.type === 'password' ? 'password' : 'text' });
  if (f.persistKey) {
    const saved = localStorage.getItem(f.persistKey);
    if (saved != null) { vals[f.name] = saved; }
  }
  input.value = vals[f.name] ?? '';
  if (f.placeholder) input.placeholder = f.placeholder;
  input.addEventListener('input', () => {
    set(input.value);
    if (f.persistKey) localStorage.setItem(f.persistKey, input.value);
  });
  return el('div', { class: 'field' }, labelEl(f), input, helpEl(f));
}

// ---------- 图片/视频输入（URL 或本地上传→base64）----------
function mediaRow(item, onChange, onRemove, removable, accept, noSubject) {
  const isVideo = accept === 'video';
  const isAudio = accept === 'audio';
  const thumb = isVideo
    ? el('video', { class: 'thumb', muted: '', playsinline: '' })
    : isAudio
      ? el('audio', { class: 'thumb-audio', controls: '' })
      : el('img', { class: 'thumb', alt: '' });
  const placeholder = isVideo ? '视频 URL 或 data:video/mp4;base64,...'
    : isAudio ? '音频 URL 或 data:audio/mp3;base64,...'
    : '图片 URL 或 data:image/...;base64,...';
  const urlInput = el('input', { type: 'text', placeholder });
  const acceptAttr = isVideo ? 'video/*' : isAudio ? 'audio/*' : 'image/*';
  const file = el('input', { type: 'file', accept: acceptAttr, style: 'display:none' });

  const refresh = () => { thumb.src = item.value || ''; };
  urlInput.value = (item.value && item.value.startsWith('data:')) ? item.value.slice(0, 48) + '…(base64)' : (item.value || '');
  refresh();

  urlInput.addEventListener('input', () => { item.value = urlInput.value; item.mode = 'url'; refresh(); onChange(); });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    const dataUri = await fileToDataUri(f);
    item.value = dataUri; item.mode = 'file';
    urlInput.value = dataUri.slice(0, 48) + '…(base64)';
    refresh(); onChange();
  });

  const uploadBtn = el('button', { type: 'button', class: 'mini-btn', onclick: () => file.click() }, '上传');
  const row = el('div', { class: 'row' }, thumb, urlInput, uploadBtn, file);
  // 图片输入额外提供「主体库」素材选项（选中后填入主体图片 URL，避免大图 base64）
  if (!isVideo && !isAudio && !noSubject) {
    row.append(el('button', {
      type: 'button', class: 'mini-btn',
      onclick: () => openSubjectPicker((url) => {
        item.value = url; item.mode = 'url';
        urlInput.value = url; refresh(); onChange();
      }),
    }, '主体库'));
  }
  if (removable) row.append(el('button', { type: 'button', class: 'mini-btn', onclick: onRemove }, '删除'));
  return el('div', { class: 'image-item' }, row);
}

function renderImages(f, vals) {
  const list = vals[f.name];
  const container = el('div', { class: 'images-list' });
  const wrap = el('div', { class: 'field' }, labelEl(f), helpEl(f), container);
  const accept = f.accept || 'image';

  const rebuild = () => {
    container.innerHTML = '';
    list.forEach((item, i) => {
      const removable = list.length > (f.min || 0);
      container.append(mediaRow(item, () => {}, () => { list.splice(i, 1); rebuild(); }, removable, accept));
    });
    if (list.length < (f.max || 99)) {
      const addLabel = accept === 'video' ? '+ 添加视频' : accept === 'audio' ? '+ 添加音频' : '+ 添加图片';
      container.append(el('button', { type: 'button', class: 'mini-btn add-btn', onclick: () => { list.push({ mode: 'url', value: '' }); rebuild(); } }, addLabel));
    }
  };
  rebuild();
  return wrap;
}

// ---------- 关键帧输入（multiframe）----------
function renderKeyframes(f, vals) {
  const list = vals[f.name];
  const container = el('div', { class: 'keyframes-list' });
  const wrap = el('div', { class: 'field' }, labelEl(f), helpEl(f), container);

  const rebuild = () => {
    container.innerHTML = '';
    list.forEach((kf, i) => {
      const thumb = el('img', { class: 'thumb', alt: '' });
      const urlInput = el('input', { type: 'text', placeholder: '关键帧图片 URL 或 base64' });
      const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      const promptInput = el('input', { type: 'text', placeholder: '该帧提示词 prompt（可选）' });
      const durInput = el('input', { type: 'number', min: 2, max: 7, step: 1, style: 'width:90px' });

      urlInput.value = kf.key_image?.startsWith('data:') ? kf.key_image.slice(0, 40) + '…(base64)' : (kf.key_image || '');
      promptInput.value = kf.prompt || '';
      durInput.value = kf.duration ?? 5;
      thumb.src = kf.key_image || '';

      urlInput.addEventListener('input', () => { kf.key_image = urlInput.value; kf.key_mode = 'url'; thumb.src = kf.key_image; });
      file.addEventListener('change', async () => {
        const ff = file.files[0]; if (!ff) return;
        kf.key_image = await fileToDataUri(ff); kf.key_mode = 'file';
        urlInput.value = kf.key_image.slice(0, 40) + '…(base64)'; thumb.src = kf.key_image;
      });
      promptInput.addEventListener('input', () => { kf.prompt = promptInput.value; });
      durInput.addEventListener('input', () => { kf.duration = durInput.value === '' ? '' : Number(durInput.value); });

      const uploadBtn = el('button', { type: 'button', class: 'mini-btn', onclick: () => file.click() }, '上传');
      const subjBtn = el('button', {
        type: 'button', class: 'mini-btn',
        onclick: () => openSubjectPicker((url) => { kf.key_image = url; kf.key_mode = 'url'; urlInput.value = url; thumb.src = url; }),
      }, '主体库');
      const rmBtn = list.length > (f.min || 2)
        ? el('button', { type: 'button', class: 'mini-btn', onclick: () => { list.splice(i, 1); rebuild(); } }, '删除')
        : '';
      const head = el('div', { class: 'row' }, el('strong', {}, `帧 ${i + 1}`), thumb, urlInput, uploadBtn, file, subjBtn, rmBtn);
      const meta = el('div', { class: 'row' }, promptInput, el('span', { class: 'help' }, '时长(s)'), durInput);
      container.append(el('div', { class: 'keyframe-item' }, head, meta));
    });
    if (list.length < (f.max || 9)) {
      container.append(el('button', { type: 'button', class: 'mini-btn add-btn', onclick: () => { list.push(emptyKeyframe()); rebuild(); } }, '+ 添加关键帧'));
    }
  };
  rebuild();
  return wrap;
}

// ---------- 解说剧资产输入（explain-comic assets）----------
function renderEcAssets(f, vals) {
  const list = vals[f.name];
  const container = el('div', { class: 'keyframes-list' });
  const wrap = el('div', { class: 'field' }, labelEl(f), helpEl(f), container);

  // voice_id 建议列表（供 datalist 补全）
  const dlId = 'ec-voices';
  if (!document.getElementById(dlId)) {
    const dl = el('datalist', { id: dlId });
    EC_VOICES.forEach((v) => dl.append(el('option', { value: v })));
    document.body.append(dl);
  }

  const rebuild = () => {
    container.innerHTML = '';
    list.forEach((a, i) => {
      a.id = String(i + 1).padStart(2, '0'); // id 固定按顺序 01、02…
      const typeSel = el('select');
      EC_ASSET_TYPES.forEach((o) => {
        const opt = el('option', { value: o.value }, o.label);
        if (a.type === o.value) opt.selected = true;
        typeSel.append(opt);
      });
      typeSel.addEventListener('change', () => { a.type = typeSel.value; rebuild(); });

      const nameInput = el('input', { type: 'text', placeholder: '名称 name（≤30 字符，如 林枫 / 旁白）' });
      nameInput.value = a.name || '';
      nameInput.addEventListener('input', () => { a.name = nameInput.value; });

      const thumb = el('img', { class: 'thumb', alt: '' });
      thumb.src = a.image_uri || '';
      const urlInput = el('input', { type: 'text', placeholder: '参考图 image_uri：URL 或 data:image/...;base64' });
      urlInput.value = a.image_uri?.startsWith('data:') ? a.image_uri.slice(0, 40) + '…(base64)' : (a.image_uri || '');
      const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      urlInput.addEventListener('input', () => { a.image_uri = urlInput.value; thumb.src = a.image_uri; });
      file.addEventListener('change', async () => {
        const ff = file.files[0]; if (!ff) return;
        a.image_uri = await fileToDataUri(ff);
        urlInput.value = a.image_uri.slice(0, 40) + '…(base64)'; thumb.src = a.image_uri;
      });
      const uploadBtn = el('button', { type: 'button', class: 'mini-btn', onclick: () => file.click() }, '上传');

      const descInput = el('input', { type: 'text', placeholder: '描述 description（身份/形象/年龄等，可选）' });
      descInput.value = a.description || '';
      descInput.addEventListener('input', () => { a.description = descInput.value; });

      // 音色仅角色有意义（短剧 short-play 无音色字段，noVoice 时隐藏）
      let voiceInput = '';
      if (!f.noVoice) {
        voiceInput = el('input', { type: 'text', placeholder: '音色 voice_id（仅角色，场景/道具留空）', list: dlId });
        voiceInput.value = a.voice_id || '';
        voiceInput.disabled = a.type !== 'character';
        voiceInput.addEventListener('input', () => { a.voice_id = voiceInput.value; });
      }

      const rmBtn = list.length > (f.min || 0)
        ? el('button', { type: 'button', class: 'mini-btn', onclick: () => { list.splice(i, 1); rebuild(); } }, '删除')
        : '';
      const head = el('div', { class: 'row' }, el('strong', {}, a.id), typeSel, nameInput, rmBtn);
      const subjBtn = el('button', {
        type: 'button', class: 'mini-btn',
        onclick: () => openSubjectPicker((url) => { a.image_uri = url; urlInput.value = url; thumb.src = url; }),
      }, '主体库');
      const imgRow = el('div', { class: 'row' }, thumb, urlInput, uploadBtn, file, subjBtn);
      const metaRow = el('div', { class: 'row' }, descInput, voiceInput);
      container.append(el('div', { class: 'keyframe-item' }, head, imgRow, metaRow));
    });
    if (list.length < (f.max || 14)) {
      container.append(el('button', { type: 'button', class: 'mini-btn add-btn', onclick: () => { list.push(emptyAsset()); rebuild(); } }, '+ 添加资产'));
    }
  };
  rebuild();
  return wrap;
}

function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------- 组装请求体 ----------
function buildParams() {
  const cfg = MODES[state.mode];
  const vals = currentValues();
  const params = {};
  const errors = [];

  // v3 协议（drama 系列）：请求体是 content 数组，单独组装
  if (cfg.protocol === 'v3') {
    const p = buildDramaParams(vals, errors);
    const raw = $('#rawOverride').value.trim();
    if (raw) {
      try { deepMerge(p, JSON.parse(raw)); }
      catch (e) { errors.push('原始 JSON 覆盖解析失败: ' + e.message); }
    }
    return { params: p, errors };
  }

  // ec 协议（解说剧成片）：script_content + assets[] 结构，单独组装
  if (cfg.protocol === 'ec') {
    const p = buildEcParams(vals, errors);
    const raw = $('#rawOverride').value.trim();
    if (raw) {
      try { deepMerge(p, JSON.parse(raw)); }
      catch (e) { errors.push('原始 JSON 覆盖解析失败: ' + e.message); }
    }
    return { params: p, errors };
  }

  // sp 协议（短剧成片）：script_content + assets[]（均需参考图）结构
  if (cfg.protocol === 'sp') {
    const p = buildSpParams(vals, errors);
    const raw = $('#rawOverride').value.trim();
    if (raw) {
      try { deepMerge(p, JSON.parse(raw)); }
      catch (e) { errors.push('原始 JSON 覆盖解析失败: ' + e.message); }
    }
    return { params: p, errors };
  }

  // kling 协议（第三方 www.ysxxai.com）：model + prompt + duration + resolution + aspect_ratio/image
  if (cfg.protocol === 'kling') {
    const p = buildKlingParams(vals, errors);
    const raw = $('#rawOverride').value.trim();
    if (raw) {
      try { deepMerge(p, JSON.parse(raw)); }
      catch (e) { errors.push('原始 JSON 覆盖解析失败: ' + e.message); }
    }
    return { params: p, errors };
  }

  for (const f of cfg.fields) {
    const v = vals[f.name];

    // 当前模型不支持的字段不发送（如 viduq4-preview 不接受 aspect_ratio/style 等）
    if (!fieldAllowed(state.mode, vals.model, f.name)) continue;
    // 指定仅某些模型可用的字段（如 sounds 仅 viduq4-preview）
    if (f.onlyModels && !f.onlyModels.includes(vals.model)) continue;
    // 场景联动：visibleWhen 不匹配时该字段不属于当前场景
    if (f.visibleWhen && !visibleMatch(f, vals)) continue;
    // 依赖字段：父开关未开启时不发送（如 audio=false 时省略 audio_type）
    if (f.dependsOn && !vals[f.dependsOn]) continue;

    if (f.type === 'images') {
      const arr = (v || []).map((x) => x.value).filter((s) => s && s.trim());
      if (f.required && arr.length < (f.min || 1)) errors.push(`${f.label} 至少需要 ${f.min || 1} 张`);
      if (arr.length > (f.max || 99)) errors.push(`${f.label} 最多 ${f.max} 张`);
      if (f.min === f.max && f.min > 0 && arr.length !== f.min && arr.length > 0)
        errors.push(`${f.label} 需要正好 ${f.min} 张`);
      if (arr.length) params[f.name] = arr;
      continue;
    }

    if (f.type === 'keyframes') {
      const arr = (v || []).map((kf) => {
        const o = { key_image: (kf.key_image || '').trim() };
        if (kf.prompt && kf.prompt.trim()) o.prompt = kf.prompt.trim();
        if (kf.duration !== '' && kf.duration != null) o.duration = Number(kf.duration);
        return o;
      }).filter((o) => o.key_image);
      if (f.required && arr.length < (f.min || 2)) errors.push(`${f.label} 至少 ${f.min || 2} 个（且每帧需填图片）`);
      if (arr.length > (f.max || 9)) errors.push(`${f.label} 最多 ${f.max} 个`);
      if (arr.length) params[f.name] = arr;
      continue;
    }

    if (f.type === 'checkbox') { params[f.name] = Boolean(v); continue; }

    // 空值处理
    const isEmpty = v === '' || v === null || v === undefined;
    if (isEmpty) {
      if (f.required) errors.push(`${f.label} 为必填项`);
      continue;
    }
    // seed 为 0 视为随机 -> 不发送
    if (f.name === 'seed' && Number(v) === 0) continue;
    // omitEmpty 字段若为空已在上面跳过；这里正常发送
    params[f.name] = v;
  }

  // 参考生：images / videos / sounds 至少填一个（sounds 仅 viduq4-preview）
  if (state.mode === 'reference2video' && !params.images && !params.videos && !params.sounds) {
    errors.push('参考图 images、参考视频 videos、参考音频 sounds 至少填一个');
  }
  // 参考生：仅 viduq2-pro 支持视频主体
  if (state.mode === 'reference2video' && params.videos && vals.model !== 'viduq2-pro') {
    errors.push('参考视频 videos 仅 viduq2-pro 模型支持，请将模型切换为 viduq2-pro');
  }

  // 全局兜底：所有请求默认携带 moderation（默认 disabled）。
  // 覆盖 text2video / reference2image 等 schema 未含该字段的模式，
  // 以及部分模型（如 NS）未显式设置的情况；若已设值（如用户选 enabled）则不覆盖。
  if (params.moderation === undefined || params.moderation === '') {
    params.moderation = 'disabled';
  }

  // raw JSON 覆盖
  const raw = $('#rawOverride').value.trim();
  if (raw) {
    try {
      deepMerge(params, JSON.parse(raw));
    } catch (e) {
      errors.push('原始 JSON 覆盖解析失败: ' + e.message);
    }
  }
  return { params, errors };
}

// v3 协议（drama 系列）：组装 content 数组请求体
function buildDramaParams(vals, errors) {
  // 按当前站点映射模型名（国内 ↔ 海外 -ab- 版）
  const model = dramaModelForRegion(vals.model, getRegion());
  const lim = dramaLimits(model);
  const scene = vals.scene || 'text';
  const content = [];
  const params = { model, content };

  // 1) 文本提示词
  const prompt = (vals.prompt || '').trim();
  if (!prompt) errors.push('提示词 prompt 为必填项');
  if (prompt) content.push({ type: 'text', text: prompt });

  // 2) 素材（三种场景互斥）
  const urlsOf = (name) => (vals[name] || []).map((x) => x.value).filter((s) => s && s.trim());
  const pushMedia = (type, url, role) => {
    const key = `${type}_url`;
    content.push({ type: key, [key]: { url }, role });
  };

  if (scene === 'first_frame') {
    const arr = urlsOf('first_image');
    if (arr.length !== 1) errors.push('首帧图生视频需要正好 1 张首帧图');
    arr.slice(0, 1).forEach((u) => pushMedia('image', u, 'first_frame'));
  } else if (scene === 'first_last') {
    const arr = urlsOf('frame_images');
    if (arr.length !== 2) errors.push('首尾帧生视频需要正好 2 张图（首帧 + 尾帧）');
    if (arr[0]) pushMedia('image', arr[0], 'first_frame');
    if (arr[1]) pushMedia('image', arr[1], 'last_frame');
  } else if (scene === 'reference') {
    const imgs = urlsOf('ref_images');
    const vids = urlsOf('ref_videos');
    const auds = urlsOf('ref_audios');
    if (imgs.length > lim.images) errors.push(`参考图 ${model} 最多 ${lim.images} 张`);
    if (vids.length > lim.videos) errors.push(`参考视频 ${model} 最多 ${lim.videos} 段`);
    if (auds.length > lim.audios) errors.push(`参考音频 ${model} 最多 ${lim.audios} 段`);
    if (!imgs.length && !vids.length && !auds.length) errors.push('多模态参考至少需要 1 个参考素材（图/视频/音频）');
    imgs.forEach((u) => pushMedia('image', u, 'reference_image'));
    vids.forEach((u) => pushMedia('video', u, 'reference_video'));
    auds.forEach((u) => pushMedia('audio', u, 'reference_audio'));
  }

  // 3) 顶层参数
  params.resolution = vals.resolution || '720p';
  if (params.resolution === '4k' && !lim.resolutions.includes('4k'))
    errors.push('4K 仅 viduq3-drama-std 支持');
  params.ratio = vals.ratio || 'adaptive';
  const dur = Number(vals.duration);
  if (dur !== -1 && (dur < 4 || dur > lim.maxDuration))
    errors.push(`时长需为 -1(自动) 或 4~${lim.maxDuration} 秒（当前模型）`);
  params.duration = dur;
  params.generate_audio = Boolean(vals.generate_audio);
  params.watermark = Boolean(vals.watermark);
  // 默认关闭内容审核（与 v2 路径一致）
  params.moderation = 'disabled';
  if (vals.return_last_frame) params.return_last_frame = true;
  if (vals.omni_reference_task_type && vals.omni_reference_task_type !== 'auto')
    params.omni_reference_task_type = vals.omni_reference_task_type;
  if (vals.web_search) params.tools = [{ type: 'web_search' }];
  if (vals.safety_identifier && vals.safety_identifier.trim())
    params.safety_identifier = vals.safety_identifier.trim();
  if (vals.execution_expires_after != null && vals.execution_expires_after !== '')
    params.execution_expires_after = Number(vals.execution_expires_after);
  if (vals.callback_url && vals.callback_url.trim())
    params.callback_url = vals.callback_url.trim();

  return params;
}

// ec 协议（解说剧成片）：组装 script_content + assets[] 请求体
function buildEcParams(vals, errors) {
  const params = {};
  const name = (vals.script_name || '').trim();
  const content = (vals.script_content || '').trim();
  if (!name) errors.push('剧集名称 script_name 为必填项');
  if (name.length > 20) errors.push('剧集名称不超过 20 个字符');
  if (!content) errors.push('剧本内容 script_content 为必填项');
  params.script_name = name;
  params.script_content = content;

  // 资产：只收集填了名称的行
  const assets = (vals.assets || [])
    .filter((a) => a.name && a.name.trim())
    .map((a, i) => {
      const o = {
        id: String(i + 1).padStart(2, '0'),
        type: a.type || 'character',
        name: a.name.trim(),
      };
      if (a.image_uri && a.image_uri.trim()) o.image_uri = a.image_uri.trim();
      if (a.description && a.description.trim()) o.description = a.description.trim();
      // 音色仅角色携带；场景/道具传空串（符合文档）
      o.voice_id = (o.type === 'character' && a.voice_id) ? a.voice_id.trim() : '';
      return o;
    });
  if (assets.length > 14) errors.push('资产最多 14 个');
  if (assets.length) params.assets = assets;

  params.resolution = vals.resolution || '720p';
  params.aspect_ratio = vals.aspect_ratio || '9:16';
  if (vals.style && vals.style.trim()) {
    if (/[，。！？、；：,.!?;:]/.test(vals.style)) errors.push('视频风格 style 不可包含标点符号');
    params.style = vals.style.trim();
  }
  params.language = vals.language || 'zh';
  const spd = Number(vals.tts_speed);
  if (!(spd >= 1 && spd <= 1.5)) errors.push('TTS 语速需在 1~1.5 之间');
  params.tts_speed = spd;
  params.enable_lipsync = Boolean(vals.enable_lipsync);
  params.quality = vals.quality || 'standard';
  params.add_subtitle = Boolean(vals.add_subtitle);
  if (params.add_subtitle && vals.subtitle_type) params.subtitle_type = vals.subtitle_type;
  if (vals.comic_bgm && vals.comic_bgm.trim()) params.comic_bgm = vals.comic_bgm.trim();
  if (vals.callback_url && vals.callback_url.trim()) params.callback_url = vals.callback_url.trim();

  return params;
}

// sp 协议（短剧成片）：组装 script_content + assets[]（均需参考图）请求体
function buildSpParams(vals, errors) {
  const params = {};
  const name = (vals.script_name || '').trim();
  const content = (vals.script_content || '').trim();
  if (!name) errors.push('剧集名称 script_name 为必填项');
  if (name.length > 20) errors.push('剧集名称不超过 20 个字符');
  if (!content) errors.push('剧本内容 script_content 为必填项');
  if (content && content.length < 20) errors.push('剧本内容至少 20 个字符');
  params.script_name = name;
  params.script_content = content;

  // 资产：必传，每个需 名称 + 参考图
  const assets = (vals.assets || [])
    .filter((a) => (a.name && a.name.trim()) || (a.image_uri && a.image_uri.trim()))
    .map((a, i) => {
      const o = {
        id: String(i + 1).padStart(2, '0'),
        type: a.type || 'character',
        name: (a.name || '').trim(),
        image_uri: (a.image_uri || '').trim(),
      };
      if (a.description && a.description.trim()) o.description = a.description.trim();
      return o;
    });
  if (!assets.length) errors.push('资产 assets 为必填项（至少 1 个）');
  if (assets.some((a) => !a.name)) errors.push('每个资产都需要填写名称 name');
  if (assets.some((a) => !a.image_uri)) errors.push('每个资产都需要参考图 image_uri');
  if (assets.length > 14) errors.push('资产最多 14 个');
  if (assets.length) params.assets = assets;

  // 站位参考图（可选，单张）
  const upload = (vals.upload_image_url || []).map((x) => x.value).filter((s) => s && s.trim());
  if (upload.length) params.upload_image_url = upload[0];

  params.placement = vals.placement || 'upload';
  const dur = Number(vals.duration);
  if (vals.duration !== '' && vals.duration != null && dur !== 0) {
    if (dur < 2 || dur > 180) errors.push('时长需为 0(自动) 或 2~180 秒');
    params.duration = dur;
  } else {
    params.duration = 0;
  }
  params.resolution = vals.resolution || '1080p';
  params.aspect_ratio = vals.aspect_ratio || '9:16';
  if (vals.style && vals.style.trim()) {
    if (/[，。！？、；：,.!?;:]/.test(vals.style)) errors.push('视频风格 style 不可包含标点符号');
    params.style = vals.style.trim();
  }
  params.quality = vals.quality || 'standard';
  if (vals.callback_url && vals.callback_url.trim()) params.callback_url = vals.callback_url.trim();

  return params;
}

// kling 协议（第三方 www.ysxxai.com）：组装 /v1/video/generations 请求体
function buildKlingParams(vals, errors) {
  if (!vals.apiKey || !vals.apiKey.trim()) errors.push('Kling API Key 为必填项');
  if (!vals.prompt || !vals.prompt.trim()) errors.push('提示词 prompt 为必填项');
  const dur = Number(vals.duration) || 10;
  if (dur < 3 || dur > 20) errors.push('时长需为 3~20 秒的整数');

  const mode = vals.generateMode || 'text2video';
  const p = {
    model: vals.model || 'kling-4.0',
    prompt: (vals.prompt || '').trim(),
    duration: dur,
    resolution: vals.resolution || '720p',
  };
  if (mode === 'image2video') {
    // 图生视频：首帧图；不传 aspect_ratio（画面比例跟随首帧图）
    const img = (vals.image || []).map((x) => x.value).filter((s) => s && s.trim())[0];
    if (!img) errors.push('image2video 需要提供 1 张首帧图');
    else p.image = img;
  } else if (mode === 'reference') {
    // 参考素材生视频：contents 数组，自动编号 id
    const urlsOf = (name) => (vals[name] || []).map((x) => x.value).filter((s) => s && s.trim());
    const imgs = urlsOf('refer_images');
    const feats = urlsOf('feature_videos');
    const base = urlsOf('base_video');
    const elem = (vals.element_id || '').trim();
    const contents = [];
    imgs.forEach((u, i) => contents.push({ type: 'refer_image', id: `image_${i + 1}`, url: u }));
    feats.forEach((u, i) => contents.push({ type: 'feature_video', id: `video_${i + 1}`, url: u }));
    base.slice(0, 1).forEach((u) => contents.push({ type: 'base_video', id: 'base_1', url: u }));
    if (elem) contents.push({ type: 'element', id: 'element_1', element_id: elem });
    if (!contents.length) errors.push('参考素材模式至少需要 1 个素材（参考图/参考视频/待编辑视频/主体）');
    if (feats.length > 5) errors.push('参考视频最多 5 段');
    p.contents = contents;
    // 音频：original 需搭配参考视频或待编辑视频
    const audio = vals.audio || 'native';
    if (audio === 'original' && !feats.length && !base.length) errors.push('audio=original 需含至少一段参考视频或待编辑视频');
    p.audio = audio;
    // 宽高比（含 adaptive）；未传则不发，跟随素材
    if (vals.aspect_ratio) p.aspect_ratio = vals.aspect_ratio;
  } else {
    // 文生视频：支持宽高比
    p.aspect_ratio = vals.aspect_ratio || '16:9';
  }
  return p;
}

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof target[k] === 'object') {
      deepMerge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

// ---------- 提交 / 查询 / 轮询 / 取消 ----------
function getApiKey() { return apiKeyInput.value.trim(); }

// 判断某任务是否由 NS 模型创建（查询/取消需路由到 .com）。
// 优先查历史记录里该 task 的 model，回退到当前表单所选 model。
function isNsTask(taskId) {
  const rec = loadHistory().find((r) => r.taskId === taskId);
  if (rec && rec.model) return isNsModel(rec.model);
  return isNsModel(currentValues().model);
}
function nsQuery(taskId) { return isNsTask(taskId) ? '&ns=1' : ''; }

// 任务所属协议（v2 默认 / v3 drama / ec 解说剧）——查询/取消需走同协议
function protoForTask(taskId) {
  const rec = loadHistory().find((r) => r.taskId === taskId);
  const mode = (rec && rec.mode) || state.mode;
  return MODES[mode]?.protocol || 'v2';
}
function protoQuery(taskId) {
  const p = protoForTask(taskId);
  return p === 'v2' ? '' : `&proto=${p}`;
}

// 任务创建时使用的站点（国内/海外）；查询/取消需走同一站点
function regionForTask(taskId) {
  const rec = loadHistory().find((r) => r.taskId === taskId);
  if (rec && rec.region) return rec.region;
  return getRegion();
}
function regionQuery(taskId) { return `&region=${encodeURIComponent(regionForTask(taskId))}`; }

// Kling 任务：查询用独立 Key（localStorage），其余与普通任务一致
function keyForTask(taskId) {
  if (protoForTask(taskId) === 'kling') return (localStorage.getItem('kling_api_key') || '').trim();
  return getApiKey();
}

function setStatus(html, kind = 'info') {
  $('#status').innerHTML = `<span class="badge ${kind}">${kind.toUpperCase()}</span> ${html}`;
}
function showResponse(obj) { $('#responseBox').textContent = JSON.stringify(obj, null, 2); }

$('#previewBtn').addEventListener('click', () => {
  const { params, errors } = buildParams();
  if (errors.length) { setStatus('校验未通过：' + errors.join('；'), 'failed'); }
  else setStatus('请求体预览（未提交）', 'info');
  showResponse({ mode: state.mode, endpoint: MODES[state.mode].endpoint, params });
});

$('#submitBtn').addEventListener('click', async () => {
  const { params, errors } = buildParams();
  if (errors.length) { setStatus('校验未通过：' + errors.join('；'), 'failed'); return; }
  const btn = $('#submitBtn');
  btn.disabled = true;
  setStatus('提交中…', 'processing');
  try {
    const isKling = MODES[state.mode].protocol === 'kling';
    const submitKey = isKling ? (currentValues().apiKey || '').trim() : getApiKey();
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: state.mode, apiKey: submitKey, region: getRegion(), params }),
    });
    const j = await r.json();
    showResponse(j);
    const d = j.data || {};
    const nested = d.data || {};
    const taskId = j.ok && (d.task_id || d.id || d.taskId || nested.task_id || nested.id || nested.taskId);
    if (taskId) {
      $('#taskIdInput').value = taskId;
      // 记录历史任务（关键输入 + 提交时间）
      addHistory({
        taskId,
        mode: state.mode,
        modeTitle: MODES[state.mode].title,
        kind: MODES[state.mode].kind || 'video',
        model: params.model || '—',
        duration: params.duration != null ? params.duration : '—',
        resolution: params.resolution || '—',
        prompt: params.prompt || params.script_content || (Array.isArray(params.content)
          ? (params.content.find((c) => c.type === 'text') || {}).text || ''
          : ''),
        submitAt: Date.now(),
        region: getRegion(),
        state: j.data.state || 'created',
        elapsedSec: null,
        url: '', coverUrl: '', watermarkedUrl: '', error: '',
      });
      setStatus(`任务已创建：<b>${taskId}</b>，已开始自动轮询（每 10 秒）…`, 'processing');
      startPolling(taskId, true);
    } else {
      setStatus('提交失败或返回异常（详见下方响应）', 'failed');
    }
  } catch (e) {
    setStatus('请求错误：' + e.message, 'failed');
  } finally {
    btn.disabled = false;
  }
});

async function queryTask(taskId) {
  const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}?apiKey=${encodeURIComponent(keyForTask(taskId))}${protoQuery(taskId)}${nsQuery(taskId)}${regionQuery(taskId)}`);
  return r.json();
}

$('#queryBtn').addEventListener('click', async () => {
  const id = $('#taskIdInput').value.trim();
  if (!id) return setStatus('请先填写任务 ID', 'failed');
  setStatus('查询中…', 'processing');
  const j = await queryTask(id);
  handleTaskResult(j);
});

const POLL_INTERVAL_MS = 10000; // 10 秒轮询一次

// 开始轮询某任务，直到 success/failed。轮询起点用于统计生成用时。
function startPolling(taskId, resetStart) {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  state.pollTaskId = taskId;
  if (resetStart || !state.pollStart) state.pollStart = Date.now();
  $('#autoPollBtn').textContent = '停止轮询';

  const tick = async () => {
    let j;
    try { j = await queryTask(taskId); }
    catch (e) { setStatus('轮询出错：' + e.message + '（继续重试）', 'processing'); return; }
    const status = handleTaskResult(j);
    const waited = ((Date.now() - state.pollStart) / 1000).toFixed(0);

    if (status === 'success' || status === 'failed') {
      stopPolling();
      const data = j.data || {};
      const c = (data.creations || [])[0] || {};
      updateHistory(taskId, {
        state: status,
        elapsedSec: Number(waited),
        url: c.url || '',
        coverUrl: c.cover_url || '',
        watermarkedUrl: c.watermarked_url || '',
        error: status === 'failed' ? (data.err_code || data.err_msg || '生成失败') : '',
      });
      if (status === 'success') setStatus(`任务完成 ✅ 用时约 <b>${waited}s</b>`, 'success');
      else setStatus(`任务失败 ❌ 用时约 ${waited}s`, 'failed');
    } else {
      updateHistory(taskId, { state: status });
      setStatus(`任务状态：<b>${status}</b> · 已等待 ${waited}s（每 10s 轮询）`, 'processing');
    }
  };
  tick();
  state.pollTimer = setInterval(tick, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  state.pollTaskId = null;
  $('#autoPollBtn').textContent = '自动轮询';
}

$('#autoPollBtn').addEventListener('click', () => {
  if (state.pollTimer) { stopPolling(); setStatus('已停止轮询', 'info'); return; }
  const id = $('#taskIdInput').value.trim();
  if (!id) return setStatus('请先填写任务 ID', 'failed');
  startPolling(id, true);
});

$('#cancelBtn').addEventListener('click', async () => {
  const id = $('#taskIdInput').value.trim();
  if (!id) return setStatus('请先填写任务 ID', 'failed');
  setStatus('取消中…', 'processing');
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/cancel?apiKey=${encodeURIComponent(keyForTask(id))}${protoQuery(id)}${nsQuery(id)}${regionQuery(id)}`, { method: 'POST' });
  const j = await r.json();
  showResponse(j);
  setStatus(j.ok ? '已请求取消任务' : '取消失败（详见响应）', j.ok ? 'info' : 'failed');
});

function handleTaskResult(j) {
  showResponse(j);
  const data = j.data || {};
  const status = data.state || data.status || 'unknown';
  const kind = status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'processing';
  setStatus(`任务状态：<b>${status}</b>`, kind);
  renderVideos(data);
  return status;
}

// 依据 URL 后缀判断产出是图片还是视频
function isImageUrl(url) {
  const path = String(url).split('?')[0].toLowerCase();
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(path)) return false;
  if (/\.(jpg|jpeg|png|webp|gif|bmp)$/.test(path)) return true;
  return false; // 默认按视频处理
}

function renderVideos(data) {
  const box = $('#videos');
  box.innerHTML = '';
  const creations = data.creations || [];
  creations.forEach((c) => {
    const url = c.url || c.watermarked_url;
    if (url) {
      if (isImageUrl(url)) {
        box.append(el('img', { src: url, class: 'result-img' }));
        box.append(el('a', { href: url, target: '_blank' }, '下载/打开图片：' + url));
      } else {
        box.append(el('video', { src: url, controls: '', playsinline: '' }));
        box.append(el('a', { href: url, target: '_blank' }, '下载/打开：' + url));
      }
    }
    if (c.cover_url) box.append(el('a', { href: c.cover_url, target: '_blank' }, '封面：' + c.cover_url));
  });

  // 解说剧成片额外产物：字幕文件 + 分镜列表
  if (data.srt_url) box.append(el('a', { href: data.srt_url, target: '_blank' }, '下载字幕 (srt)'));
  if (Array.isArray(data.shots) && data.shots.length) {
    const det = el('details', { class: 'raw' });
    det.append(el('summary', {}, `分镜 shots（${data.shots.length}）`));
    data.shots.forEach((s, i) => {
      if (s.url) {
        det.append(el('video', { src: s.url, controls: '', playsinline: '', style: 'max-width:240px' }));
        det.append(el('a', { href: s.url, target: '_blank' }, `分镜 ${i + 1}（id ${s.id}）`));
      }
    });
    box.append(det);
  }
}

// ---------- 历史任务记录 ----------
const HIST_KEY = 'vidu_task_history';
const HIST_MAX = 100;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX)));
}
function addHistory(rec) {
  const list = loadHistory();
  list.unshift(rec);
  saveHistory(list);
  renderHistory();
}
function updateHistory(taskId, patch) {
  const list = loadHistory();
  const i = list.findIndex((r) => r.taskId === taskId);
  if (i >= 0) { list[i] = { ...list[i], ...patch }; saveHistory(list); renderHistory(); }
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function renderHistory() {
  const box = $('#history');
  const list = loadHistory();
  $('#histCount').textContent = list.length ? `共 ${list.length} 条` : '';
  box.innerHTML = '';
  if (!list.length) {
    box.append(el('div', { class: 'hist-empty' }, '暂无任务记录。提交任务后会自动记录并轮询结果。'));
    return;
  }
  list.forEach((r) => box.append(renderHistItem(r)));
}

function renderHistItem(r) {
  const stateKind = r.state === 'success' ? 'success' : r.state === 'failed' ? 'failed' : 'processing';
  const isImage = r.kind === 'image' || (r.url && isImageUrl(r.url));
  const cover = r.coverUrl || (isImage ? r.url : '') || '';
  const thumb = cover
    ? el('img', { class: 'hist-thumb', src: cover, alt: '' })
    : el('div', { class: 'hist-thumb placeholder' }, r.state === 'failed' ? '失败' : '生成中');

  const elapsed = r.elapsedSec != null ? `用时 ${r.elapsedSec}s` : (stateKind === 'processing' ? '进行中…' : '—');

  const links = el('div', { class: 'hist-links' });
  const vurl = r.url || r.watermarkedUrl;
  if (vurl) links.append(el('a', { href: vurl, target: '_blank' }, isImage ? '打开图片' : '打开视频'));
  if (r.coverUrl) links.append(el('a', { href: r.coverUrl, target: '_blank' }, '封面'));

  const main = el('div', { class: 'hist-main' },
    el('div', { class: 'hist-row1' },
      el('span', { class: 'hist-type' }, r.modeTitle || r.mode),
      el('span', { class: 'hist-chip' }, r.model),
      el('span', { class: `badge ${stateKind}` }, r.state),
    ),
    el('div', { class: 'hist-prompt', title: r.prompt || '' }, r.prompt ? r.prompt : '（无提示词）'),
    el('div', { class: 'hist-meta' },
      el('span', {}, `任务 ${r.taskId}`),
      isImage ? '' : el('span', {}, `时长 ${r.duration}s`),
      el('span', {}, `分辨率 ${r.resolution}`),
      el('span', {}, `提交 ${fmtTime(r.submitAt)}`),
    ),
    links,
  );

  const side = el('div', { class: 'hist-side' },
    el('span', { class: 'muted small' }, elapsed),
    el('button', { type: 'button', class: 'mini-btn', onclick: () => reQuery(r.taskId) }, '查询'),
  );

  return el('div', { class: 'hist-item' }, thumb, main, side);
}

// 从历史记录点「查询」：填入任务 ID 并重新轮询
function reQuery(taskId) {
  $('#taskIdInput').value = taskId;
  setStatus(`重新查询任务 <b>${taskId}</b>…`, 'processing');
  startPolling(taskId, true);
}

$('#clearHistBtn').addEventListener('click', () => {
  if (!loadHistory().length) return;
  if (confirm('确定清空全部历史任务记录？（不会删除已生成的视频文件）')) {
    localStorage.removeItem(HIST_KEY);
    renderHistory();
  }
});

// ---------- 主体库（Subjects）----------
const subjectModal = $('#subjectModal');
let subjectPickMode = null; // null=管理模式；function=选择模式回调(url)

function setSubjectStatus(html, kind = 'info') {
  $('#subjectStatus').innerHTML = html ? `<span class="badge ${kind}">${kind.toUpperCase()}</span> ${html}` : '';
}

function openSubjectLibrary() {
  subjectPickMode = null;
  $('#subjectModalTitle').textContent = '主体库';
  $('#subjectCreateBox').open = false;
  subjectModal.hidden = false;
  fetchSubjects();
}
function openSubjectPicker(onPick) {
  subjectPickMode = onPick;
  $('#subjectModalTitle').textContent = '主体库 — 选择素材';
  $('#subjectCreateBox').open = false;
  subjectModal.hidden = false;
  fetchSubjects();
}
function closeSubjectModal() { subjectModal.hidden = true; subjectPickMode = null; }

$('#subjectLibBtn').addEventListener('click', openSubjectLibrary);
$('#subjectModalClose').addEventListener('click', closeSubjectModal);
subjectModal.addEventListener('click', (e) => { if (e.target === subjectModal) closeSubjectModal(); });

// 当前列表 + 多选状态
let subjectList = [];
const subjectSelected = new Set();

function describeFail(j) {
  // 统一错误展示：优先 HTTP 状态 + Vidu 返回体
  if (j && j.viduStatus) return `HTTP ${j.viduStatus} — ${JSON.stringify(j.data || {})}`;
  return JSON.stringify((j && (j.data || j.error)) || j || '');
}

async function fetchSubjects() {
  const key = getApiKey();
  if (!key) { setSubjectStatus('请先在顶部填写 API Key', 'failed'); $('#subjectGrid').innerHTML = ''; return; }
  setSubjectStatus('加载中…', 'processing');
  subjectSelected.clear();
  try {
    const r = await fetch(`/api/subjects?apiKey=${encodeURIComponent(key)}&region=${encodeURIComponent(getRegion())}&count=100`);
    const j = await r.json();
    if (!j.ok) { setSubjectStatus('加载失败：' + describeFail(j), 'failed'); return; }
    subjectList = (j.data && j.data.subjects) || [];
    renderSubjectGrid(subjectList);
    setSubjectStatus(`共 ${j.data?.total ?? subjectList.length} 个主体` + (subjectPickMode ? '；点「选用」把主体图片填入输入框' : '；可勾选多个后「删除所选」'), 'info');
  } catch (e) {
    setSubjectStatus('加载出错：' + e.message, 'failed');
  }
}

function deletableSubjects() { return subjectList.filter((s) => s.ownership !== 'system'); }

function refreshSelectionUI() {
  const n = subjectSelected.size;
  $('#subjectSelCount').textContent = `已选 ${n}`;
  $('#subjectBatchDeleteBtn').disabled = n === 0;
  const delList = deletableSubjects();
  const all = $('#subjectSelectAll');
  all.checked = delList.length > 0 && delList.every((s) => subjectSelected.has(s.id));
  all.indeterminate = n > 0 && !all.checked;
}

function renderSubjectGrid(subjects) {
  const grid = $('#subjectGrid');
  grid.innerHTML = '';
  // 选择模式不显示多选删除工具条
  $('#subjectToolbar').hidden = Boolean(subjectPickMode) || deletableSubjects().length === 0;
  if (!subjects.length) { grid.append(el('div', { class: 'muted small' }, '暂无主体，展开上方「新建主体」上传。')); refreshSelectionUI(); return; }
  subjects.forEach((s) => {
    const img0 = (s.images || [])[0] || '';
    const card = el('div', { class: 'subject-card' });
    // 多选复选框（管理模式、可删除主体）
    if (!subjectPickMode && s.ownership !== 'system') {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = subjectSelected.has(s.id);
      cb.addEventListener('change', () => {
        if (cb.checked) subjectSelected.add(s.id); else subjectSelected.delete(s.id);
        refreshSelectionUI();
      });
      card.append(el('label', { class: 's-check' }, cb, ' 选择'));
    }
    card.append(el('img', { src: img0, alt: s.name || '' }));
    card.append(el('div', { class: 's-name' }, s.name || '(未命名)'));
    card.append(el('div', { class: 's-meta' },
      el('span', { class: 'badge-own' }, s.ownership === 'system' ? '官方' : '个人'),
      ` id ${s.id}`));
    const actions = el('div', { class: 's-actions' });
    if (subjectPickMode) {
      (s.images || []).forEach((u, i) => {
        actions.append(el('button', {
          type: 'button', class: 'mini-btn',
          onclick: () => { const cb = subjectPickMode; closeSubjectModal(); cb(u); },
        }, (s.images.length > 1 ? `选用图${i + 1}` : '选用')));
      });
    }
    if (s.ownership !== 'system') {
      actions.append(el('button', {
        type: 'button', class: 'mini-btn',
        onclick: () => deleteSubjects([s]),
      }, '删除'));
    }
    card.append(actions);
    grid.append(card);
  });
  refreshSelectionUI();
}

// 全选 / 批量删除
$('#subjectSelectAll').addEventListener('change', (e) => {
  subjectSelected.clear();
  if (e.target.checked) deletableSubjects().forEach((s) => subjectSelected.add(s.id));
  renderSubjectGrid(subjectList);
});
$('#subjectBatchDeleteBtn').addEventListener('click', () => {
  const sel = subjectList.filter((s) => subjectSelected.has(s.id));
  if (sel.length) deleteSubjects(sel);
});

// Vidu 开放 API 不支持删除主体（DELETE/PATCH/POST 删除一律返回 405），
// 文档仅提供 创建/查询/编辑。按用户要求：如实报错，不做本地伪删除。
async function deleteSubjects(list) {
  if (!list.length) return;
  const n = list.length;
  setSubjectStatus(
    `无法删除：Vidu 开放 API 未提供删除主体接口（DELETE 返回 HTTP 405）。`
    + `请到 <a href="https://platform.vidu.cn" target="_blank">platform.vidu.cn</a> 控制台删除${n > 1 ? `所选 ${n} 个主体` : '该主体'}。`,
    'failed',
  );
}

// 新建主体：复用 mediaRow 的图片输入（最多 3 张）
const subjectImages = [{ mode: 'url', value: '' }];
function rebuildSubjectImages() {
  const box = $('#subjectImagesList');
  box.innerHTML = '';
  subjectImages.forEach((item, i) => {
    const removable = subjectImages.length > 1;
    box.append(mediaRow(item, () => {}, () => { subjectImages.splice(i, 1); rebuildSubjectImages(); }, removable, 'image', true));
  });
  if (subjectImages.length < 3) {
    box.append(el('button', { type: 'button', class: 'mini-btn add-btn', onclick: () => { subjectImages.push({ mode: 'url', value: '' }); rebuildSubjectImages(); } }, '+ 添加图片'));
  }
}
rebuildSubjectImages();

$('#subjectCreateBtn').addEventListener('click', async () => {
  const name = $('#subjectNameInput').value.trim();
  const images = subjectImages.map((x) => x.value).filter((s) => s && s.trim());
  if (!name) return setSubjectStatus('请填写主体名称', 'failed');
  if (!images.length) return setSubjectStatus('至少上传 1 张主体图片', 'failed');
  if (images.length > 3) return setSubjectStatus('最多 3 张图片', 'failed');
  if (!getApiKey()) return setSubjectStatus('请先在顶部填写 API Key', 'failed');
  setSubjectStatus('创建中…', 'processing');
  try {
    const r = await fetch('/api/subjects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: getApiKey(), region: getRegion(), params: { name, images } }),
    });
    const j = await r.json();
    if (!j.ok) { setSubjectStatus('创建失败：' + JSON.stringify(j.data || j.error || ''), 'failed'); return; }
    // 重置表单
    $('#subjectNameInput').value = '';
    subjectImages.splice(0, subjectImages.length, { mode: 'url', value: '' });
    rebuildSubjectImages();
    $('#subjectCreateBox').open = false;
    fetchSubjects();
  } catch (e) {
    setSubjectStatus('创建出错：' + e.message, 'failed');
  }
});

// ---------- init ----------
renderForm();
renderHistory();
setStatus('填写参数后点击「生成视频」。提交成功后将自动轮询结果（每 10 秒），并统计生成用时。', 'info');
