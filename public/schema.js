// Vidu 各生成模式的完整参数 Schema（依据官方文档整理）
// 前端据此动态渲染表单，做到「所有输入参数在 web 都可调整」。
//
// 字段类型 type:
//   text | textarea | number | select | checkbox | images | keyframes
//
// 字段描述符字段:
//   name(参数名) label(显示名) type required default options min max step help group send
//   send: 'omitEmpty'(空则不发送) | 'always'(总是发送)

export const MODELS = ['viduq3-turbo', 'viduq3', 'viduq2-pro', 'viduq2', 'viduq1', 'vidu2.0'];
// Vidu-W 系列（NS 有声视频模型），走 api.vidu.com
export const NS_MODELS = ['viduq3-ns', 'viduq3-ns-flash', 'viduq2-ns'];
// 图生视频：额外支持 viduq4-preview + NS 模型
export const MODELS_Q4 = ['viduq4-preview', ...MODELS, ...NS_MODELS];
// 参考生视频专用模型列表（含 viduq4-preview 及 viduq3 系列 pro/mix/drama/ad + NS 模型，依据 model-map）
export const REF_VIDEO_MODELS = ['viduq4-preview', 'viduq3-turbo', 'viduq3', 'viduq3-pro', 'viduq3-mix',
  'viduq3-drama', 'viduq3-ad', 'viduq2-pro', 'viduq2', 'viduq1', 'vidu2.0', 'viduq3-ns', 'viduq3-ns-flash'];
// 文生视频专用模型列表（NS 模型，仅 viduq3-ns）
export const TEXT2VIDEO_MODELS = ['viduq3-ns'];
export const RESOLUTIONS = ['360p', '540p', '720p', '1080p', '2K', '4K'];
// 参考生视频 aspect_ratio（依据 viduq4-preview 内测文档：16:9/9:16/1:1/3:4/4:3）
export const REF_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '3:4', '4:3'];
// 参考生图（reference2image）专用取值
export const IMAGE_MODELS = ['viduq2', 'viduq1', 'viduimage-2-by-token'];
export const IMAGE_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '3:4', '4:3', '21:9', '2:3', '3:2'];
export const IMAGE_RESOLUTIONS = ['1080p', '2K', '4K'];

// ---- Drama 系列（v3 协议：/ent/api/v3/contents/generations/tasks）----
// 依据《Vidu-drama 生视频模型》文档整理。国内/海外模型名不同：海外多一段 -ab-。
export const DRAMA_MODELS = [
  'viduq3-drama-std',    // 标准满血版
  'viduq3.1-drama-std',  // 加强满血版（30 图 / 10 视频 / 10 音频，时长 4-30）
  'viduq3-drama-fast',   // 快速版
  'viduq3-drama-mini',   // mini 版
];
// 规范化为国内（canonical）名：去掉海外的 -ab-
export function dramaCanon(model) {
  return String(model || '').replace('-drama-ab-', '-drama-');
}
// 按站点得到实际模型名：国内用 canonical，海外插入 -ab-
export function dramaModelForRegion(model, region) {
  const c = dramaCanon(model);
  return region === 'com' ? c.replace('-drama-', '-drama-ab-') : c;
}
// 按站点列出可选模型
export function dramaModels(region) {
  return DRAMA_MODELS.map((m) => dramaModelForRegion(m, region));
}
export const DRAMA_SCENES = [
  { value: 'text', label: '文生视频（仅提示词）' },
  { value: 'first_frame', label: '首帧图生视频（1 张图）' },
  { value: 'first_last', label: '首尾帧图生视频（2 张图）' },
  { value: 'reference', label: '多模态参考生视频（图/视频/音频）' },
];
export const DRAMA_RATIOS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
export const DRAMA_RESOLUTIONS = ['480p', '720p', '1080p', '4k'];
export const DRAMA_TASK_TYPES = ['auto', 'reference', 'edit', 'extend'];

// 各 drama 模型的能力上限（按 canonical 名判断，国内/海外一致）
export function dramaLimits(model) {
  const canon = dramaCanon(model);
  const q31 = canon === 'viduq3.1-drama-std';
  return {
    images: q31 ? 30 : 9,
    videos: q31 ? 10 : 3,
    audios: q31 ? 10 : 3,
    maxDuration: q31 ? 30 : 15,
    // 4K 仅 viduq3-drama-std（含海外 ab 版）支持
    resolutions: canon === 'viduq3-drama-std'
      ? DRAMA_RESOLUTIONS
      : DRAMA_RESOLUTIONS.filter((r) => r !== '4k'),
  };
}

// viduq4-preview（内测版）各接口仅接受以下字段，其余字段（aspect_ratio / movement_amplitude /
// style / audio_type / bgm / voice_id 等）会被 Vidu 判为 invalid field。
// 依据官方《图生视频API（Q4）【内测版】》文档整理。
export const Q4_ALLOWED_FIELDS = {
  img2video: ['model', 'images', 'prompt', 'duration', 'seed', 'resolution', 'audio',
    'moderation', 'payload', 'off_peak', 'watermark', 'wm_position', 'wm_url', 'meta_data', 'callback_url'],
  // 参考生视频 Q4：依据《参考生视频API（Q4）【内测版】》文档整理，仅接受以下字段。
  // 文档未列 movement_amplitude / style / audio_type / bgm / voice_id（实测被静默忽略）。
  // off_peak / moderation 为通用能力（实测接受），一并放开。
  reference2video: ['model', 'images', 'sounds', 'prompt', 'duration', 'seed', 'resolution',
    'aspect_ratio', 'audio', 'moderation', 'off_peak', 'payload', 'watermark', 'wm_position',
    'wm_url', 'meta_data', 'callback_url'],
};

// NS（Vidu-W 系列）各接口仅接受以下字段，依据飞书官方文档整理。
// moderation 为通用能力，放开以便 NS 模型（如 viduq3-ns）也默认携带 moderation:disabled。
export const NS_ALLOWED_FIELDS = {
  img2video: ['model', 'images', 'prompt', 'duration', 'resolution', 'audio', 'moderation', 'callback_url'],
  text2video: ['model', 'prompt', 'seed', 'resolution', 'aspect_ratio', 'duration', 'moderation', 'callback_url'],
  reference2video: ['model', 'images', 'prompt', 'resolution', 'aspect_ratio', 'duration', 'audio', 'moderation', 'callback_url'],
};

// 判断是否为 NS 模型
export function isNsModel(model) {
  return NS_MODELS.includes(model);
}

// 判断某字段在「当前模式 + 当前所选模型」下是否可用
export function fieldAllowed(mode, model, fieldName) {
  if (model === 'viduq4-preview' && Q4_ALLOWED_FIELDS[mode]) {
    return Q4_ALLOWED_FIELDS[mode].includes(fieldName);
  }
  if (isNsModel(model) && NS_ALLOWED_FIELDS[mode]) {
    return NS_ALLOWED_FIELDS[mode].includes(fieldName);
  }
  return true;
}
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
export const MOVEMENTS = ['auto', 'small', 'medium', 'large'];
export const AUDIO_TYPES = ['all', 'speech_only', 'sound_effect_only'];
export const STYLES = ['general', 'anime'];
export const WM_POSITIONS = [
  { value: 1, label: '1 左上角' },
  { value: 2, label: '2 右上角' },
  { value: 3, label: '3 右下角' },
  { value: 4, label: '4 左下角' },
];

// 多个模式共享的通用参数（视频输出控制）
function commonVideoFields(opts = {}) {
  const fields = [
    { name: 'model', label: '模型 model', type: 'select', required: true, default: 'viduq2', options: opts.models || MODELS, group: '基础',
      help: (opts.models && opts.models.includes('viduq4-preview') ? 'viduq4-preview(最新)、' : '') + 'viduq3-turbo/viduq3(音画同出,可切镜)、viduq2-pro(参考视频)、viduq2(动态好)、viduq1(稳定)、vidu2.0(快)' },
    { name: 'duration', label: '时长 duration(秒)', type: 'number', default: 5, min: 0, max: 16, step: 1, group: '输出',
      help: 'q3/q3-turbo:3-16; q2-pro:0-10(0=自动); q2:1-10; q1:5; 2.0:4', send: 'omitEmpty' },
    { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '720p', options: RESOLUTIONS, group: '输出',
      help: 'q3/q2 系:540p/720p/1080p; q1:1080p; 2.0:360p/720p', send: 'omitEmpty' },
    { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '16:9', options: ASPECT_RATIOS, group: '输出',
      help: '默认 16:9；q2 模型支持任意宽高比', send: 'omitEmpty' },
    { name: 'seed', label: '随机种子 seed', type: 'number', default: 0, min: 0, step: 1, group: '输出',
      help: '0 或不填=随机；固定值可复现', send: 'omitEmpty' },
    { name: 'movement_amplitude', label: '运动幅度 movement_amplitude', type: 'select', default: 'auto', options: MOVEMENTS, group: '输出',
      help: 'auto/small/medium/large；q2、q3 模型该参数不生效', send: 'omitEmpty' },
  ];
  if (opts.style) {
    fields.push({ name: 'style', label: '风格 style', type: 'select', default: 'general', options: STYLES, group: '输出',
      help: 'general 通用 / anime 动漫；q2、q3 系列不生效', send: 'omitEmpty' });
  }
  return fields;
}

// 音频 / 配音相关
function audioFields(opts = {}) {
  const f = [
    { name: 'audio', label: '音视频直出 audio', type: 'checkbox', default: false, group: '音频',
      help: '是否使用音视频直出能力；q3/q3-turbo 默认 true，其他默认 false' },
    { name: 'audio_type', label: '音频类型 audio_type', type: 'select', default: 'all',
      options: ['all', 'speech_only', 'sound_effect_only'], group: '音频', dependsOn: 'audio',
      help: 'audio 为 true 时生效：all 音效+人声 / speech_only 仅人声 / sound_effect_only 仅音效', send: 'omitEmpty' },
    { name: 'bgm', label: '背景音乐 bgm', type: 'checkbox', default: false, group: '音频',
      help: '自动挑选并添加 BGM；q3 系列不生效' },
  ];
  if (opts.voice) {
    f.push({ name: 'voice_id', label: '音色 voice_id', type: 'text', default: '', group: '音频',
      help: '决定视频中声音音色，为空自动推荐；q3 系列不生效', send: 'omitEmpty' });
  }
  return f;
}

// 水印 / 元数据 / 回调 等高级参数
function advancedFields() {
  return [
    { name: 'moderation', label: '内容审核 moderation', type: 'select', default: 'disabled',
      options: ['disabled', 'enabled'], group: '高级', send: 'omitEmpty',
      help: 'disabled 关闭内容审核 / enabled 开启；默认 disabled' },
    { name: 'off_peak', label: '错峰模式 off_peak', type: 'checkbox', default: false, group: '高级',
      help: '错峰生成，积分更低，48 小时内生成' },
    { name: 'watermark', label: '添加水印 watermark', type: 'checkbox', default: false, group: '高级',
      help: '是否添加水印，默认不加' },
    { name: 'wm_position', label: '水印位置 wm_position', type: 'select', default: 3, options: WM_POSITIONS, group: '高级', dependsOn: 'watermark',
      help: '1 左上 / 2 右上 / 3 右下 / 4 左下', send: 'omitEmpty' },
    { name: 'wm_url', label: '水印图 wm_url', type: 'text', default: '', group: '高级', dependsOn: 'watermark',
      help: '自定义水印图片 URL，不填用默认水印', send: 'omitEmpty' },
    { name: 'meta_data', label: '元数据 meta_data', type: 'textarea', default: '', group: '高级',
      help: 'JSON 字符串，透传字段', send: 'omitEmpty' },
    { name: 'payload', label: '透传参数 payload', type: 'text', default: '', group: '高级',
      help: '透传字段，最多 1048576 字符', send: 'omitEmpty' },
    { name: 'callback_url', label: '回调地址 callback_url', type: 'text', default: '', group: '高级',
      help: '任务状态变化时 POST 回调该地址', send: 'omitEmpty' },
  ];
}

// ---- 解说剧成片（explain-comic，v1 协议）----
// 依据《解说剧成片API接口》文档整理。Token 鉴权，/ent/v1/explain-comic/tasks。
export const EC_LANGUAGES = [
  { value: 'zh', label: '中文 zh' },
  { value: 'en', label: '英文 en' },
  { value: 'Indonesian', label: '印尼语 Indonesian' },
  { value: 'German', label: '德语 German' },
  { value: 'French', label: '法语 French' },
  { value: 'Spanish', label: '西班牙语 Spanish' },
  { value: 'Portuguese', label: '葡萄牙语(巴西) Portuguese' },
  { value: 'Japanese', label: '日语 Japanese' },
];
export const EC_ASSET_TYPES = [
  { value: 'character', label: 'character 角色' },
  { value: 'scene', label: 'scene 场景' },
  { value: 'tool', label: 'tool 道具' },
];
export const EC_RESOLUTIONS = ['720p', '1080p'];
export const EC_ASPECT_RATIOS = ['9:16', '16:9', '4:3', '3:4'];
export const EC_SUBTITLE_TYPES = [
  { value: 'source_han_serif', label: '思源宋体 source_han_serif' },
  { value: 'source_han_sans', label: '思源黑体 source_han_sans' },
];
// 常用音色（仅角色需要；旁白通过「旁白」角色控制）
export const EC_VOICES = [
  'Chinese_Female_Currency', 'Chinese_Male_Currency', 'Chinese_Male_Protagonist',
  'Chinese_Female_Protagonist1', 'Chinese_gravelly_storyteller_vv2',
  'Chinese (Mandarin)_Reliable_Executive', 'Chinese (Mandarin)_News_Anchor',
  'Chinese (Mandarin)_Unrestrained_Young_Man', 'Arrogant_Miss', 'Robot_Armor',
  'Chinese (Mandarin)_Kind-hearted_Antie', 'Chinese (Mandarin)_Humorous_Elder',
  'Chinese (Mandarin)_Male_Announcer', 'Chinese (Mandarin)_Wise_Women',
  'Chinese (Mandarin)_Gentle_Youth', 'Chinese (Mandarin)_Warm_Girl',
  'Chinese (Mandarin)_Kind-hearted_Elder', 'Chinese (Mandarin)_Cute_Spirit',
  'Chinese (Mandarin)_Radio_Host', 'Chinese (Mandarin)_Sincere_Adult',
  'Chinese (Mandarin)_Gentle_Senior',
];

export const MODES = {
  drama2video: {
    title: 'Drama 生视频(v3)',
    endpoint: '/ent/api/v3/contents/generations/tasks',
    protocol: 'v3',
    desc: 'Vidu-drama 系列四模型：文生视频 / 首帧 / 首尾帧 / 多模态参考（图 9~30 张 + 视频 3~10 段 + 音频 3~10 段）。v3 协议，Bearer 鉴权。',
    fields: [
      { name: 'model', label: '模型 model', type: 'select', required: true, default: 'viduq3-drama-std', options: DRAMA_MODELS, regionModels: true, group: '基础',
        help: 'q3-drama-std 标准满血版(支持 4K)；q3.1-drama-std 加强版(30图/10视频/10音频, 时长≤30s)；fast 快速版；mini 极简版。海外站模型名自动切换为 -ab- 版' },
      { name: 'scene', label: '生成场景 scene', type: 'select', required: true, default: 'text',
        options: DRAMA_SCENES, group: '基础',
        help: '三种场景互斥：文生视频 / 首帧或首尾帧图生视频 / 多模态参考生视频' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: true, default: '', group: '基础',
        help: '中文建议 ≤500 字，英文 ≤1000 词；对话内容用双引号包裹可优化效果' },

      { name: 'first_image', label: '首帧图 first_frame', type: 'images', accept: 'image', required: false, min: 1, max: 1, group: '素材',
        visibleWhen: { field: 'scene', value: 'first_frame' },
        help: '首帧图生视频：1 张图；支持 URL 或本地上传(base64)；jpeg/png/webp/bmp/tiff/gif，宽高比 0.4~2.5，边长 300~6000px' },
      { name: 'frame_images', label: '首帧 + 尾帧', type: 'images', accept: 'image', required: false, min: 2, max: 2, group: '素材',
        visibleWhen: { field: 'scene', value: 'first_last' },
        help: '按顺序上传 2 张：第 1 张=首帧(first_frame)，第 2 张=尾帧(last_frame)' },
      { name: 'ref_images', label: '参考图 reference_image', type: 'images', accept: 'image', required: false, min: 0, max: 30, group: '素材',
        visibleWhen: { field: 'scene', value: 'reference' },
        help: 'q3-drama 最多 9 张；q3.1-drama 最多 30 张。单张 <30MB，请求体总计 ≤64MB' },
      { name: 'ref_videos', label: '参考视频 reference_video', type: 'images', accept: 'video', required: false, min: 0, max: 10, group: '素材',
        visibleWhen: { field: 'scene', value: 'reference' },
        help: 'q3-drama：最多 3 段、单段 2~15s、总计 ≤15s；q3.1：最多 10 段、单段 4~30s、总计 ≤30s；mp4/mov，单个 ≤200MB，24~60fps' },
      { name: 'ref_audios', label: '参考音频 reference_audio', type: 'images', accept: 'audio', required: false, min: 0, max: 10, group: '素材',
        visibleWhen: { field: 'scene', value: 'reference' },
        help: 'q3-drama：最多 3 段、单段 2~15s；q3.1：最多 10 段、单段 4~30s；wav/mp3，单个 ≤15MB' },

      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '720p', options: DRAMA_RESOLUTIONS, group: '输出',
        help: '480p/720p/1080p；4K 仅 viduq3-drama-std 支持（10bit H.265，部分播放器不兼容）' },
      { name: 'ratio', label: '宽高比 ratio', type: 'select', default: 'adaptive', options: DRAMA_RATIOS, group: '输出',
        help: 'adaptive=模型自动适配（文生按提示词、图生按首帧、参考按第一个媒体，视频优先于图片）' },
      { name: 'duration', label: '时长 duration(秒)', type: 'number', default: 5, min: -1, max: 30, step: 1, group: '输出',
        help: 'q3 系列：4~15 或 -1(自动)；q3.1-drama-std：4~30 或 -1' },
      { name: 'generate_audio', label: '生成有声视频 generate_audio', type: 'checkbox', default: false, group: '输出',
        help: '默认 false；开启输出双声道有声视频' },
      { name: 'return_last_frame', label: '返回尾帧 return_last_frame', type: 'checkbox', default: false, group: '输出',
        help: '额外返回尾帧 jpeg 图片（last_frame_url）' },
      { name: 'watermark', label: '添加水印 watermark', type: 'checkbox', default: false, group: '输出',
        help: '右下角 "AI生成" 水印' },

      { name: 'omni_reference_task_type', label: '任务类型 omni_reference_task_type', type: 'select', default: 'auto', options: DRAMA_TASK_TYPES, group: '高级',
        help: 'auto 自动判定；reference 参考生视频；edit 视频编辑（须含 reference_video，4~30s，ratio=adaptive，duration=-1）；extend 视频延长（须含 reference_video，ratio=adaptive）' },
      { name: 'web_search', label: '联网搜索 web_search', type: 'checkbox', default: false, group: '高级',
        help: '开启后提交 tools:[{"type":"web_search"}]' },
      { name: 'safety_identifier', label: '终端用户标识 safety_identifier', type: 'text', default: '', group: '高级',
        help: '终端用户哈希标识，≤64 字符', send: 'omitEmpty' },
      { name: 'execution_expires_after', label: '超时阈值 execution_expires_after(秒)', type: 'number', default: 172800, min: 3600, max: 259200, step: 1, group: '高级',
        help: '默认 172800（48h），范围 3600~259200' },
      { name: 'callback_url', label: '回调地址 callback_url', type: 'text', default: '', group: '高级',
        help: '状态变化时 POST 推送，5 秒无响应重试最多 3 次', send: 'omitEmpty' },
    ],
  },

  'explain-comic': {
    title: '解说剧成片(v1)',
    endpoint: '/ent/v1/explain-comic/tasks',
    protocol: 'ec',
    desc: '输入剧本（≥1200字中文/3000字英文会自动拆分多任务）+ 资产（角色/场景/道具），自动生成解说剧成片。Token 鉴权，v1 协议。约 400 字/分钟。',
    fields: [
      { name: 'script_name', label: '剧集名称 script_name', type: 'text', required: true, default: '', group: '基础',
        help: '不超过 20 个字符' },
      { name: 'script_content', label: '剧本内容 script_content', type: 'textarea', required: true, default: '', group: '基础',
        help: '无字数限制；中文 ≥1200 字 / 英文 ≥3000 字会自动拆分多个任务。约 400 字 = 1 分钟。角色对话用（角色名）：开头，旁白用（旁白）：' },
      { name: 'assets', label: '资产 assets', type: 'ecassets', required: false, min: 0, max: 14, group: '基础',
        help: '强烈推荐使用以确保一致性。最多 14 个（推荐 3-10）。每个资产：类型(角色/场景/道具) + 名称 + 参考图(可选) + 描述(可选) + 音色(仅角色，场景/道具留空)。旁白音色需新建一个「旁白」角色来控制，其图片随意。' },

      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '720p', options: EC_RESOLUTIONS, group: '输出',
        help: '默认 720p，可选 720p/1080p' },
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '9:16', options: EC_ASPECT_RATIOS, group: '输出',
        help: '默认 9:16' },
      { name: 'style', label: '视频风格 style', type: 'text', default: '', group: '输出',
        help: '如「3d建模风格」「2d动画风格」，≤30 字符，不可含标点。留空=真人写实', send: 'omitEmpty' },
      { name: 'language', label: '语言 language', type: 'select', default: 'zh', options: EC_LANGUAGES, group: '输出',
        help: '默认中文 zh' },
      { name: 'tts_speed', label: 'TTS 语速 tts_speed', type: 'number', default: 1.1, min: 1, max: 1.5, step: 0.1, group: '输出',
        help: '1~1.5，默认 1.1，推荐 1.3（约 400 字/分钟）' },
      { name: 'quality', label: '生成质量 quality', type: 'select', default: 'standard', options: ['standard', 'high'], group: '输出',
        help: 'standard 20 积分/s；high 25 积分/s' },

      { name: 'enable_lipsync', label: '对口型 enable_lipsync', type: 'checkbox', default: true, group: '高级',
        help: '默认开启。无对口型一致性更好，有对口型对话更自然' },
      { name: 'add_subtitle', label: '添加字幕 add_subtitle', type: 'checkbox', default: false, group: '高级',
        help: '默认关闭' },
      { name: 'subtitle_type', label: '字幕字体 subtitle_type', type: 'select', default: 'source_han_serif', options: EC_SUBTITLE_TYPES, group: '高级', dependsOn: 'add_subtitle',
        help: '思源宋体 / 思源黑体', send: 'omitEmpty' },
      { name: 'comic_bgm', label: '背景音乐 comic_bgm', type: 'text', default: '', group: '高级',
        help: '支持 URL；短于视频会重复播放，长于视频会截断', send: 'omitEmpty' },
      { name: 'callback_url', label: '回调地址 callback_url', type: 'text', default: '', group: '高级',
        help: '任务状态变化时 POST 回调（含回调签名）', send: 'omitEmpty' },
    ],
  },

  'short-play': {
    title: '短剧成片(v1)',
    endpoint: '/ent/v1/short-play/tasks',
    protocol: 'sp',
    desc: '输入分镜剧本 + 资产（角色/场景/道具，均需参考图），生成带台词短剧（viduq3-drama）。Token 鉴权，v1 协议。约 400 字/分钟，最长约 3 分钟。',
    fields: [
      { name: 'script_name', label: '剧集名称 script_name', type: 'text', required: true, default: '', group: '基础',
        help: '不超过 20 个字符' },
      { name: 'script_content', label: '剧本内容 script_content', type: 'textarea', required: true, default: '', group: '基础',
        help: '最低 20 字；中文 ≤2000 字符 / 英文 ≤5000 字符。可用「@角色名」引用资产、分镜标注（秒数/景别/机位/台词）。可写「请给我生成 xx 秒的时长」作为参考' },
      { name: 'assets', label: '资产 assets', type: 'ecassets', required: true, min: 1, max: 14, noVoice: true, needImage: true, group: '基础',
        help: '必传。最多 14 个（推荐 3-10）。每个资产：类型(角色/场景/道具) + 名称 + 参考图(必填) + 描述(可选)。参考图支持 URL 或本地上传；png/jpeg/jpg/webp，像素 ≥128×128，比例 <1:4 或 4:1' },
      { name: 'upload_image_url', label: '站位参考图 upload_image_url', type: 'images', accept: 'image', required: false, min: 0, max: 1, group: '基础',
        help: '可选；贯穿整个任务的站位参考图。填了它则 placement 的 panorama/step 不生效' },

      { name: 'placement', label: '站位模式 placement', type: 'select', default: 'upload', options: ['upload', 'panorama', 'step'], group: '输出',
        help: 'upload 最快(默认)；panorama 全景参考；step 顺序参考(上一镜截帧输入下一镜)。后两者仅在未传站位参考图时生效' },
      { name: 'duration', label: '时长 duration(秒)', type: 'number', default: 0, min: 0, max: 180, step: 1, group: '输出',
        help: '0=自动规划(默认)；可传 2~30 的整数秒；长时长仅支持自动，最长约 3 分钟', send: 'omitEmpty' },
      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '1080p', options: ['1080p'], group: '输出',
        help: '仅 1080p' },
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '9:16', options: ['9:16', '16:9'], group: '输出',
        help: '默认 9:16' },
      { name: 'style', label: '视频风格 style', type: 'text', default: '', group: '输出',
        help: '如「3d建模风格」「2d动画风格」，≤30 字符，不可含标点。留空=真人写实', send: 'omitEmpty' },
      { name: 'quality', label: '生成质量 quality', type: 'select', default: 'standard', options: ['standard', 'high'], group: '输出',
        help: 'standard 28 积分/s；high 58 积分/s' },

      { name: 'callback_url', label: '回调地址 callback_url', type: 'text', default: '', group: '高级',
        help: '任务状态变化时 POST 回调（含回调签名）', send: 'omitEmpty' },
    ],
  },
  'kling-video': {
    title: 'Kling 生视频',
    endpoint: '/v1/video/generations',
    protocol: 'kling',
    desc: '通过第三方网关 www.ysxxai.com 调用 Kling 视频模型。独立 API Key（Bearer），与 Vidu 的 Key/站点无关。文生 / 图生视频。',
    fields: [
      { name: 'apiKey', label: 'Kling API Key', type: 'password', required: true, default: '', persistKey: 'kling_api_key', group: '基础',
        placeholder: 'Bearer api-key（www.ysxxai.com）',
        help: 'Kling 专用密钥，Bearer 鉴权；与顶部 Vidu Key 无关，单独保存在本浏览器' },
      { name: 'model', label: '模型 model', type: 'select', required: true, default: 'kling-4.0',
        options: ['kling-4.0', 'kling-4.0-flash'], group: '基础',
        help: 'kling-4.0 / kling-4.0-flash（flash 更快）' },
      { name: 'generateMode', label: '生成方式 generateMode', type: 'select', default: 'text2video',
        options: ['text2video', 'image2video', 'reference'], group: '基础',
        help: 'text2video 文生；image2video 图生（首帧图）；reference 参考素材生视频（参考图/参考视频/待编辑视频/已建主体）' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: true, default: '', group: '基础',
        help: '描述画面、动作、镜头、风格；必填。可用素材 id（如 image_1 / video_1 / element_1）指代参考素材' },
      { name: 'image', label: '首帧图 image', type: 'images', accept: 'image', required: false, min: 0, max: 1, group: '基础',
        visibleWhen: { field: 'generateMode', value: 'image2video' },
        help: 'image2video 时提供 1 张首帧图（URL 或本地上传/主体库）；产出比例跟随该图' },

      { name: 'refer_images', label: '参考图 refer_image', type: 'images', accept: 'image', required: false, min: 0, max: 10, group: '参考素材',
        visibleWhen: { field: 'generateMode', value: 'reference' },
        help: '参考图片（保持主体一致），可多张；自动编号 image_1、image_2…，可在提示词中引用' },
      { name: 'feature_videos', label: '参考视频 feature_video', type: 'images', accept: 'video', required: false, min: 0, max: 5, group: '参考素材',
        visibleWhen: { field: 'generateMode', value: 'reference' },
        help: '参考视频，最多 5 段，单段/合计 3~20 秒；自动编号 video_1…' },
      { name: 'base_video', label: '待编辑视频 base_video', type: 'images', accept: 'video', required: false, min: 0, max: 1, group: '参考素材',
        visibleWhen: { field: 'generateMode', value: 'reference' },
        help: '视频编辑：待编辑的原视频，最多 1 段，3~20 秒' },
      { name: 'element_id', label: '引用主体 element_id', type: 'text', default: '', group: '参考素材',
        visibleWhen: { field: 'generateMode', value: 'reference' },
        help: '引用已创建的 Kling 主体 id（可选）；编号为 element_1', send: 'omitEmpty' },
      { name: 'audio', label: '音频 audio', type: 'select', default: 'native', options: ['native', 'original'], group: '参考素材',
        visibleWhen: { field: 'generateMode', value: 'reference' },
        help: 'native 生成配音；original 保留原视频声音（需含参考视频或待编辑视频）。仅参考素材模式支持' },

      { name: 'duration', label: '时长 duration(秒)', type: 'number', default: 5, min: 3, max: 20, step: 1, group: '输出',
        help: '3~20 秒，默认 10' },
      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '720p', options: ['720p'], group: '输出',
        help: '仅支持 720p' },
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '16:9', options: ['21:9', '16:9', '9:16', '1:1', 'adaptive'], group: '输出',
        visibleWhen: { field: 'generateMode', value: ['text2video', 'reference'] },
        help: '文生：21:9/16:9/9:16/1:1；参考素材模式另支持 adaptive（跟随素材）；图生不可设' },
    ],
  },
  reference2video: {
    title: '参考生视频',
    endpoint: '/ent/v2/reference2video',
    desc: '上传参考图（viduq4-preview 支持 1~12 张，其他模型最多 7 张）或参考视频（仅 viduq2-pro）+ 文本描述，生成主体一致的视频；viduq4-preview 还支持 0~3 个参考音频（音色参考）。',
    fields: [
      ...commonVideoFields({ style: true, models: REF_VIDEO_MODELS }).slice(0, 1), // model 放最前（含 viduq4-preview 及 viduq3 系列）
      { name: 'images', label: '参考图 images', type: 'images', accept: 'image', required: false, min: 0, max: 12, group: '基础',
        help: 'viduq4-preview：1~12 张参考图；其他模型：最多 7 张（点「+ 添加图片」添加多张）。支持图片 URL 或本地上传(转 base64)；png/jpeg/jpg/webp，比例需 < 1:4 或 4:1。images / videos / sounds 至少填一个' },
      { name: 'videos', label: '参考视频 videos', type: 'images', accept: 'video', required: false, min: 0, max: 2, group: '基础',
        help: '仅 viduq2-pro 支持：1 个 8 秒视频 或 2 个 5 秒视频；mp4/avi/mov；比例 < 1:4 或 4:1' },
      { name: 'sounds', label: '参考音频 sounds', type: 'images', accept: 'audio', required: false, min: 0, max: 3, group: '基础',
        onlyModels: ['viduq4-preview'],
        help: '仅 viduq4-preview 支持：0~3 个参考音频，模型以此音频为参考生成主体一致的声音；每个 3~12 秒，mp3 格式，单个 ≤50M' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: true, default: '', group: '基础',
        help: '视频文本描述，≤5000 字符' },
      ...commonVideoFields({ style: true }).slice(1, 3), // duration / resolution（剔除通用 aspect_ratio 与 seed）
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '16:9', options: REF_VIDEO_ASPECT_RATIOS, group: '输出',
        help: 'viduq4-preview：16:9(默认)/9:16/1:1/3:4/4:3', send: 'omitEmpty' },
      ...commonVideoFields({ style: true }).slice(4, 5), // seed
      ...commonVideoFields({ style: true }).slice(-2), // movement_amplitude / style（viduq4-preview 下自动隐藏）
      ...audioFields({ voice: true }),
      ...advancedFields(),
    ],
  },

  text2video: {
    title: '文生视频(NS)',
    endpoint: '/ent/v2/text2video',
    desc: '纯文本描述生成有声视频（Vidu-W 系列 NS 模型）。',
    fields: [
      { name: 'model', label: '模型 model', type: 'select', required: true, default: 'viduq3-ns', options: TEXT2VIDEO_MODELS, group: '基础',
        help: 'viduq3-ns：支持输出有声视频，支持智能切镜' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: true, default: '', group: '基础',
        help: '视频文本描述，≤1500 字符' },
      { name: 'duration', label: '时长 duration(秒)', type: 'number', default: 5, min: 2, max: 15, step: 1, group: '输出',
        help: 'viduq3-ns：2-15 秒', send: 'omitEmpty' },
      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '720p', options: ['720p', '1080p'], group: '输出',
        help: '默认 720p，可选 720p/1080p', send: 'omitEmpty' },
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '16:9', options: ['16:9', '9:16', '1:1', '3:4', '4:3'], group: '输出',
        help: '默认 16:9', send: 'omitEmpty' },
      { name: 'seed', label: '随机种子 seed', type: 'number', default: 0, min: 0, step: 1, group: '输出',
        help: '0 或不填=随机；固定值可复现', send: 'omitEmpty' },
      { name: 'callback_url', label: '回调地址 callback_url', type: 'text', default: '', group: '高级',
        help: '任务状态变化时 POST 回调该地址', send: 'omitEmpty' },
    ],
  },

  reference2image: {
    title: '参考生图',
    endpoint: '/ent/v2/reference2image',
    kind: 'image', // 产出为图片
    desc: '参考主体图（0~3 张）+ 文本描述生成图片；viduq2 不传图即为「文生图」。',
    fields: [
      { name: 'model', label: '模型 model', type: 'select', required: true, default: 'viduq2', options: IMAGE_MODELS, group: '基础',
        help: 'viduq2：文生图/图片编辑/参考生图；viduq1：参考生图；viduimage-2-by-token：按 token 计费版（需账号开通该模型权限）' },
      { name: 'images', label: '参考图 images', type: 'images', accept: 'image', required: false, min: 0, max: 3, group: '基础',
        help: '0~3 张主体参考图（点「+ 添加图片」添加多张）；viduq2 不传图=文生图；png/jpeg/jpg/webp，比例 < 1:4 或 4:1' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: true, default: '', group: '基础',
        help: '图片文本描述，≤2000 字符' },
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '16:9', options: IMAGE_ASPECT_RATIOS, group: '输出',
        help: 'viduq1: 16:9/9:16/1:1/3:4/4:3；viduq2 另支持 21:9/2:3/3:2', send: 'omitEmpty' },
      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '1080p', options: IMAGE_RESOLUTIONS, group: '输出',
        help: 'viduq1: 1080p；viduq2: 1080p/2K/4K', send: 'omitEmpty' },
      { name: 'seed', label: '随机种子 seed', type: 'number', default: 0, min: 0, step: 1, group: '输出',
        help: '0 或不填=随机；固定值可复现', send: 'omitEmpty' },
      { name: 'payload', label: '透传参数 payload', type: 'text', default: '', group: '高级',
        help: '透传字段，最多 1048576 字符', send: 'omitEmpty' },
      { name: 'callback_url', label: '回调地址 callback_url', type: 'text', default: '', group: '高级',
        help: '任务状态变化时 POST 回调该地址', send: 'omitEmpty' },
    ],
  },

  img2video: {
    title: '图生视频',
    endpoint: '/ent/v2/img2video',
    desc: '上传 1 张首帧图片 + 文本描述，生成视频。',
    fields: [
      ...commonVideoFields({ style: true, models: MODELS_Q4 }).slice(0, 1), // 含 viduq4-preview
      { name: 'images', label: '首帧图 images', type: 'images', required: true, min: 1, max: 1, group: '基础',
        help: '1 张首帧图；支持图片 URL 或本地上传(转 base64)；png/jpeg/jpg/webp' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: false, default: '', group: '基础',
        help: '视频文本描述，≤5000 字符（可留空）' },
      ...commonVideoFields({ style: true }).slice(1),
      ...audioFields({ voice: true }),
      ...advancedFields(),
    ],
  },

  'start-end2video': {
    title: '首尾帧生视频',
    endpoint: '/ent/v2/start-end2video',
    desc: '上传首帧和尾帧共 2 张图片 + 文本描述，生成从首帧过渡到尾帧的视频。',
    fields: [
      ...commonVideoFields({ style: true }).slice(0, 1),
      { name: 'images', label: '首帧+尾帧 images', type: 'images', required: true, min: 2, max: 2, group: '基础',
        help: '按顺序上传 2 张图：第 1 张=首帧，第 2 张=尾帧；png/jpeg/jpg/webp' },
      { name: 'prompt', label: '提示词 prompt', type: 'textarea', required: false, default: '', group: '基础',
        help: '视频文本描述，≤5000 字符（可留空）' },
      ...commonVideoFields({ style: true }).slice(1),
      ...audioFields({ voice: true }),
      ...advancedFields(),
    ],
  },

  multiframe: {
    title: '智能多帧',
    endpoint: '/ent/v2/multiframe',
    desc: '设置 2~9 个关键帧（每帧可带独立提示词与时长），生成按时间轴串联的多帧视频。',
    fields: [
      ...commonVideoFields({ style: false }).slice(0, 1),
      { name: 'image_settings', label: '关键帧 image_settings', type: 'keyframes', required: true, min: 2, max: 9, group: '基础',
        help: '2~9 个关键帧，输入顺序即时间轴顺序；每帧: key_image(必填) + prompt(可选) + duration 2~7 秒' },
      { name: 'prompt', label: '全局提示词 prompt', type: 'textarea', required: false, default: '', group: '基础',
        help: '整体文本描述（可选），≤5000 字符', send: 'omitEmpty' },
      // multiframe 时长由每个关键帧控制，这里不放顶层 duration
      { name: 'resolution', label: '分辨率 resolution', type: 'select', default: '720p', options: RESOLUTIONS, group: '输出', send: 'omitEmpty' },
      { name: 'aspect_ratio', label: '宽高比 aspect_ratio', type: 'select', default: '16:9', options: ASPECT_RATIOS, group: '输出', send: 'omitEmpty' },
      { name: 'seed', label: '随机种子 seed', type: 'number', default: 0, min: 0, step: 1, group: '输出', send: 'omitEmpty',
        help: '0 或不填=随机' },
      { name: 'movement_amplitude', label: '运动幅度 movement_amplitude', type: 'select', default: 'auto', options: MOVEMENTS, group: '输出', send: 'omitEmpty' },
      ...audioFields({ voice: false }),
      ...advancedFields(),
    ],
  },
};
