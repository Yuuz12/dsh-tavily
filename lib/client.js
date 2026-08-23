window.__ModuleLoader__.load({
	id: 'dsh-tavily',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		let react = require('react');

		const inject = ['slots'];

		const ENDPOINT = '/dsh-tavily';

		const CSS = [
			'.dst-card { display:flex; flex-direction:column; gap:12px; max-width:760px; color:var(--dsw-alias-label-primary,#222); font-size:13px; }',
			'.dst-intro { margin:0; line-height:1.6; color:var(--dsw-alias-label-secondary,#888); }',
			'.dst-status { display:flex; align-items:center; gap:8px; margin:0; padding:8px 10px; border-radius:6px; background:var(--dsw-alias-bg-layer-2,#f6f6f6); border:1px solid var(--dsw-alias-border-l1,#e5e5e5); line-height:1.5; }',
			'.dst-dot { flex:none; width:8px; height:8px; border-radius:50%; }',
			'.dst-rowline { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }',
			'.dst-field { display:flex; flex-direction:column; gap:4px; }',
			'.dst-label { font-size:12px; color:var(--dsw-alias-label-secondary,#888); }',
			'.dst-select, .dst-input { box-sizing:border-box; padding:6px 9px; font:inherit; font-size:13px; color:var(--dsw-alias-label-primary,#222); background:var(--dsw-alias-bg-layer-2,#fff); border:1px solid var(--dsw-alias-border-l1,#ccc); border-radius:4px; }',
			'.dst-input.small { width:64px; padding:6px 6px; }',
			'.dst-switch { position:relative; width:36px; height:20px; flex:none; cursor:pointer; border-radius:999px; border:1px solid var(--dsw-alias-border-l2,#bbb); background:var(--dsw-alias-bg-layer-3,#eee); transition:background .16s,border-color .16s; padding:0; }',
			'.dst-switch[data-on="true"] { background:var(--dsw-alias-brand-primary,#4c6ef5); border-color:var(--dsw-alias-brand-primary,#4c6ef5); }',
			'.dst-switch::after { content:""; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff; transition:left .16s; box-shadow:0 1px 2px rgba(0,0,0,.2); }',
			'.dst-switch[data-on="true"]::after { left:18px; }',
			'.dst-btn { appearance:none; font:inherit; font-size:12px; cursor:pointer; padding:4px 10px; color:var(--dsw-alias-label-primary,#222); background:var(--dsw-alias-bg-layer-1,#fff); border:1px solid var(--dsw-alias-border-l2,#ccc); border-radius:4px; white-space:nowrap; }',
			'.dst-btn:hover:not(:disabled) { border-color:var(--dsw-alias-label-dimmed,#888); }',
			'.dst-btn:disabled { opacity:.5; cursor:default; }',
			'.dst-btn.primary { color:#fff; background:var(--dsw-alias-brand-primary,#4c6ef5); border-color:var(--dsw-alias-brand-primary,#4c6ef5); }',
			'.dst-btn.danger { color:var(--dsw-alias-state-error-primary,#d1242f); }',
			'.dst-keys { display:flex; flex-direction:column; gap:8px; margin:0; padding:0; list-style:none; }',
			'.dst-key { display:flex; flex-direction:column; gap:6px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1,#e5e5e5); border-radius:8px; background:var(--dsw-alias-bg-layer-2,#fafafa); }',
			'.dst-key.disabled { opacity:.55; }',
			'.dst-key-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
			'.dst-order { display:flex; flex-direction:column; gap:2px; flex:none; }',
			'.dst-arrow { appearance:none; font:inherit; font-size:9px; line-height:1; cursor:pointer; padding:2px 6px; color:var(--dsw-alias-label-secondary,#666); background:transparent; border:1px solid var(--dsw-alias-border-l2,#ccc); border-radius:3px; }',
			'.dst-arrow:hover:not(:disabled) { color:var(--dsw-alias-label-primary,#222); }',
			'.dst-arrow:disabled { opacity:.35; cursor:default; }',
			'.dst-masked { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; }',
			'.dst-labelInput { width:130px; padding:3px 7px; font:inherit; font-size:12px; color:var(--dsw-alias-label-primary,#222); background:var(--dsw-alias-bg-layer-1,#fff); border:1px solid var(--dsw-alias-border-l1,#ddd); border-radius:4px; }',
			'.dst-badge { white-space:nowrap; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:500; line-height:17px; background:var(--dsw-alias-bg-module-platform,#ececec); color:var(--dsw-alias-label-secondary,#666); }',
			'.dst-badge.warn { color:#b45309; background:rgba(245,158,11,.15); }',
			'.dst-badge.err { color:var(--dsw-alias-state-error-primary,#d1242f); background:var(--dsw-alias-state-error-bg,rgba(209,36,47,.1)); }',
			'.dst-badge.ok { color:var(--dsw-alias-state-success-primary,#1a7f37); background:var(--dsw-alias-state-success-bg,rgba(26,127,55,.1)); }',
			'.dst-spacer { flex:1; }',
			'.dst-stats { display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--dsw-alias-label-secondary,#666); }',
			'.dst-stats b { font-weight:600; color:var(--dsw-alias-label-primary,#222); font-variant-numeric:tabular-nums; }',
			'.dst-bar { position:relative; flex:1 1 140px; height:6px; min-width:120px; border-radius:999px; background:var(--dsw-alias-bg-layer-3,#eee); overflow:hidden; }',
			'.dst-bar>i { position:absolute; inset:0 auto 0 0; border-radius:999px; }',
			'.dst-baltext { font-size:12px; color:var(--dsw-alias-label-secondary,#666); font-variant-numeric:tabular-nums; }',
			'.dst-addrow { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding-top:4px; }',
			'.dst-addrow .dst-input { flex:1 1 220px; }',
			'.dst-msg { margin:0; font-size:12px; color:var(--dsw-alias-state-success-primary,#1a7f37); }',
			'.dst-err { margin:0; font-size:12px; color:var(--dsw-alias-state-error-primary,#d1242f); white-space:pre-wrap; }',
			'.dst-hint { margin:0; padding-top:8px; border-top:1px solid var(--dsw-alias-border-l1,#e5e5e5); font-size:12px; line-height:1.7; color:var(--dsw-alias-label-secondary,#888); }',
			'.dst-lasterr { margin:0; font-size:11px; color:var(--dsw-alias-label-tertiary,#999); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:420px; }',
		].join('\n');

		async function api(path, body) {
			const init = body !== undefined
				? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
				: undefined;
			const res = await fetch(ENDPOINT + path, init);
			let data;
			try { data = await res.json(); } catch (e) { data = { ok: false, error: 'HTTP ' + res.status }; }
			return data;
		}

		function fmtInt(n) {
			if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
			return String(n);
		}

		function BalanceBar({ usage }) {
			if (!usage) return react.createElement('span', { className: 'dst-baltext' }, '余额未知（点「刷新用量」获取）');
			const used = usage.usage;
			const limit = usage.limit;
			const pct = limit ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0;
			const remainText = limit == null ? '∞' : fmtInt(limit - used);
			const color = limit == null ? '#1a7f37' : pct >= 80 ? '#d1242f' : pct >= 50 ? '#b45309' : '#1a7f37';
			return react.createElement(react.Fragment, null,
				react.createElement('div', { className: 'dst-bar', title: '本月已用 ' + fmtInt(used) + (limit != null ? ' / ' + fmtInt(limit) : '') },
					react.createElement('i', { style: { width: (limit == null ? 100 : pct) + '%', background: color } })
				),
				react.createElement('span', { className: 'dst-baltext' },
					(fmtInt(used)) + (limit != null ? ' / ' + fmtInt(limit) : '') + '，剩余 ' + remainText +
					(usage.plan ? ' · ' + usage.plan : '')
				)
			);
		}

		function KeyRow({ k, st, index, total, strategy, busy, onAction, onLabelSave, draftLabel, setDraftLabel }) {
			const stats = st || {};
			const cooling = stats.cooling === true;
			return react.createElement('li', { className: 'dst-key' + (k.disabled ? ' disabled' : ''), key: k.id },
				react.createElement('div', { className: 'dst-key-top' },
					react.createElement('div', { className: 'dst-order' },
						react.createElement('button', {
							className: 'dst-arrow', disabled: busy || index === 0, title: '上移',
							onClick: () => onAction(() => api('/keys/move', { id: k.id, dir: -1 })),
						}, '▲'),
						react.createElement('button', {
							className: 'dst-arrow', disabled: busy || index === total - 1, title: '下移',
							onClick: () => onAction(() => api('/keys/move', { id: k.id, dir: 1 })),
						}, '▼')
					),
					react.createElement('span', { className: 'dst-masked', title: '密钥已脱敏显示' }, '#' + (index + 1) + '  ' + k.masked),
					react.createElement('input', {
						className: 'dst-labelInput', value: draftLabel !== undefined ? draftLabel : (k.label || ''),
						placeholder: '备注名', maxLength: 40,
						onChange: (e) => setDraftLabel(k.id, e.target.value),
						onBlur: () => onLabelSave(k.id),
						onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
					}),
					k.hasWarningPrefix && react.createElement('span', { className: 'dst-badge warn', title: 'Tavily 密钥通常以 tvly- 开头' }, '格式提醒'),
					cooling && react.createElement('span', { className: 'dst-badge warn' }, '冷却中'),
					k.disabled && react.createElement('span', { className: 'dst-badge' }, '已停用'),
					react.createElement('span', { className: 'dst-spacer' }),
					react.createElement('button', {
						className: 'dst-btn', disabled: busy,
						onClick: () => onAction(() => api('/keys/test', { id: k.id }), '测试'),
					}, '测试'),
					react.createElement('button', {
						className: 'dst-btn', disabled: busy,
						onClick: () => onAction(() => api('/keys/update', { id: k.id, disabled: !k.disabled })),
					}, k.disabled ? '启用' : '停用'),
					react.createElement('button', {
						className: 'dst-btn danger', disabled: busy,
						onClick: () => onDeleteClick(k, onAction),
					}, '删除')
				),
				react.createElement('div', { className: 'dst-rowline' },
					react.createElement(BalanceBar, { usage: k.usage }),
					k.stale && k.usage && react.createElement('span', { className: 'dst-badge' }, '数据可能过期')
				),
				react.createElement('div', { className: 'dst-stats' },
					react.createElement('span', null, '调用 ', react.createElement('b', null, fmtInt(stats.requests))),
					react.createElement('span', null, '成功 ', react.createElement('b', null, fmtInt(stats.success))),
					react.createElement('span', null, '失败 ', react.createElement('b', null, fmtInt(stats.failed))),
					react.createElement('span', null, '消耗积分 ', react.createElement('b', null, fmtInt(stats.creditsUsed))),
					stats.lastLatencyMs != null && react.createElement('span', null, '最近耗时 ', react.createElement('b', null, stats.lastLatencyMs + 'ms')),
					stats.lastUsedAt && react.createElement('span', null, '最近使用 ', new Date(stats.lastUsedAt).toLocaleString())
				),
				stats.lastError && react.createElement('p', { className: 'dst-lasterr', title: stats.lastError }, '最近错误：' + stats.lastError)
			);
		}

		function onDeleteClick(k, onAction) {
			if (window.confirm('确定删除密钥 ' + k.masked + '？其统计与用量缓存将一并清除。')) {
				onAction(() => api('/keys/remove', { id: k.id }));
			}
		}

		function TavilyCard() {
			const [state, setState] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [message, setMessage] = react.useState('');
			const [error, setError] = react.useState('');
			const [newKey, setNewKey] = react.useState('');
			const [newLabel, setNewLabel] = react.useState('');
			const [labelDrafts, setLabelDrafts] = react.useState({});

			react.useEffect(() => {
				let alive = true;
				api('/state').then((r) => {
					if (!alive) return;
					if (r && r.ok) setState(r.state);
					else setError((r && r.error) || '无法读取插件状态');
				}).catch((e) => {
					if (alive) setError('无法连接 dsh-tavily 宿主端点：' + (e && e.message ? e.message : String(e)) + '。请确认插件已安装并重启 DSH。');
				});
				return () => { alive = false; };
			}, []);

			async function run(fn, okText) {
				setBusy(true); setMessage(''); setError('');
				try {
					const r = await fn();
					if (r && r.ok) {
						if (r.state) setState(r.state);
						if (okText) setMessage(typeof okText === 'string' ? okText : '');
					} else if (r && r.state) {
						setState(r.state);
						setError((r && r.error) || '操作失败');
					} else {
						setError((r && r.error) || '操作失败');
					}
					return r;
				} catch (e) {
					setError('请求失败：' + (e && e.message ? e.message : String(e)));
					return null;
				} finally {
					setBusy(false);
				}
			}

			function patchConfig(patch, okText) {
				return run(() => api('/config', patch), okText);
			}

			function onLabelSave(id) {
				const draft = labelDrafts[id];
				if (draft === undefined) return;
				const clean = draft.trim();
				setLabelDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
				run(() => api('/keys/update', { id, label: clean }));
			}

			if (!state) {
				return react.createElement('div', { className: 'dst-card' },
					error
						? react.createElement('p', { className: 'dst-err' }, error)
						: react.createElement('p', { className: 'dst-intro' }, '正在连接宿主…')
				);
			}

			const cfg = state.config || {};
			const routing = state.routing || {};
			const keys = Array.isArray(state.keys) ? state.keys : [];
			const stats = state.stats || {};

			let statusColor = '#888';
			let statusText;
			if (routing.active) {
				statusColor = 'var(--dsw-alias-state-success-primary,#1a7f37)';
				statusText = '已接管网页搜索：模型的 web_search 工具现在通过 Tavily 执行。';
			} else if (cfg.enabled && keys.filter((k) => !k.disabled).length === 0) {
				statusColor = '#b45309';
				statusText = '开关已打开，但没有可用密钥——当前仍由官方搜索兜底。请先添加至少一个 API Key。';
			} else if (cfg.enabled && !routing.overrideInstalled) {
				statusColor = '#b45309';
				statusText = '无法接管路由（searchProviderId 不可写）——当前仍由官方搜索执行。';
			} else {
				statusText = '未接管：网页搜索仍由 DSH 官方提供方执行。';
			}

			return react.createElement('div', { className: 'dst-card' },
				react.createElement('p', { className: 'dst-intro' },
					'用 Tavily 替换 DSH 官方网页搜索：支持多 API Key、按余额优先轮流使用、失败自动切换，并分别统计每个 Key 的用量。'
				),

				react.createElement('p', { className: 'dst-status' },
					react.createElement('span', { className: 'dst-dot', style: { background: statusColor } }),
					react.createElement('span', null, statusText,
						routing.baselineId ? '（基线路由：' + routing.baselineId + '）' : '',
						routing.registeredProviders && routing.registeredProviders.length
							? '　当前注册的搜索提供方：' + routing.registeredProviders.join(', ')
							: ''
					)
				),

				react.createElement('div', { className: 'dst-rowline' },
					react.createElement('button', {
						className: 'dst-switch', role: 'switch', 'aria-checked': cfg.enabled === true,
						'data-on': cfg.enabled === true, disabled: busy,
						onClick: () => patchConfig({ enabled: !(cfg.enabled === true) }),
					}),
					react.createElement('div', { className: 'dst-field' },
						react.createElement('span', { className: 'dst-label' }, '替换官方网页搜索'),
						react.createElement('span', { className: 'dst-label' }, cfg.enabled ? '开启中——web_search 走 Tavily' : '关闭——web_search 走官方搜索')
					)
				),

				react.createElement('div', { className: 'dst-rowline' },
					react.createElement('div', { className: 'dst-field' },
						react.createElement('label', { className: 'dst-label' }, '多密钥使用顺序'),
						react.createElement('select', {
							className: 'dst-select', value: cfg.strategy || 'balance', disabled: busy,
							onChange: (e) => patchConfig({ strategy: e.target.value }),
						},
							react.createElement('option', { value: 'balance' }, '余额优先：剩余额度多的先用，同额轮流'),
							react.createElement('option', { value: 'manual' }, '手动顺序：按下面列表从上到下')
						)
					),
					react.createElement('div', { className: 'dst-field' },
						react.createElement('label', { className: 'dst-label' }, '搜索深度'),
						react.createElement('select', {
							className: 'dst-select', value: cfg.searchDepth || 'basic', disabled: busy,
							onChange: (e) => patchConfig({ searchDepth: e.target.value }),
						},
							react.createElement('option', { value: 'basic' }, 'basic · 1积分/次'),
							react.createElement('option', { value: 'advanced' }, 'advanced · 2积分/次'),
							react.createElement('option', { value: 'fast' }, 'fast · 低延迟'),
							react.createElement('option', { value: 'ultra-fast' }, 'ultra-fast · 极速')
						)
					),
					react.createElement('div', { className: 'dst-field' },
						react.createElement('label', { className: 'dst-label' }, '单次结果上限'),
						react.createElement('input', {
							className: 'dst-input small', type: 'number', min: 1, max: 20,
							defaultValue: cfg.maxResults != null ? String(cfg.maxResults) : '8', key: 'mr-' + cfg.maxResults,
							disabled: busy,
							onBlur: (e) => {
								const n = Number(e.target.value);
								if (Number.isInteger(n) && n >= 1 && n <= 20 && n !== cfg.maxResults) patchConfig({ maxResults: n });
								else e.target.value = String(cfg.maxResults != null ? cfg.maxResults : 8);
							},
							onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
						})
					),
					react.createElement('div', { className: 'dst-field' },
						react.createElement('label', { className: 'dst-label' }, '类别'),
						react.createElement('select', {
							className: 'dst-select', value: cfg.topic || 'general', disabled: busy,
							onChange: (e) => patchConfig({ topic: e.target.value }),
						},
							react.createElement('option', { value: 'general' }, 'general'),
							react.createElement('option', { value: 'news' }, 'news'),
							react.createElement('option', { value: 'finance' }, 'finance')
						)
					),
					react.createElement('div', { className: 'dst-field' },
						react.createElement('label', { className: 'dst-label' }, 'AI 摘要回答'),
						react.createElement('button', {
							className: 'dst-switch', role: 'switch', 'aria-checked': cfg.includeAnswer === true,
							'data-on': cfg.includeAnswer === true, disabled: busy,
							onClick: () => patchConfig({ includeAnswer: !(cfg.includeAnswer === true) }),
						})
					)
				),

				react.createElement('ul', { className: 'dst-keys' },
					keys.map((k, index) => react.createElement(KeyRow, {
						key: k.id,
						k,
						st: stats[k.id],
						index,
						total: keys.length,
						strategy: cfg.strategy,
						busy,
						onAction: (fn, okText) => run(fn, okText),
						onLabelSave,
						draftLabel: labelDrafts[k.id],
						setDraftLabel: (id, text) => setLabelDrafts((prev) => ({ ...prev, [id]: text })),
					})),
					keys.length === 0 && react.createElement('li', { className: 'dst-intro' }, '还没有添加任何 Tavily API Key。')
				),

				react.createElement('div', { className: 'dst-addrow' },
					react.createElement('input', {
						className: 'dst-input', type: 'password', autoComplete: 'off',
						placeholder: '粘贴 Tavily API Key（tvly-…）', value: newKey,
						disabled: busy,
						onChange: (e) => setNewKey(e.target.value),
					}),
					react.createElement('input', {
						className: 'dst-input', style: { flex: '0 1 160px' }, type: 'text',
						placeholder: '备注名（可选）', value: newLabel, maxLength: 40,
						disabled: busy,
						onChange: (e) => setNewLabel(e.target.value),
					}),
					react.createElement('button', {
						className: 'dst-btn primary', disabled: busy || newKey.trim().length < 8,
						onClick: () => {
							run(() => api('/keys', { key: newKey.trim(), label: newLabel.trim() })).then((r) => {
								if (r && r.ok) { setNewKey(''); setNewLabel(''); setMessage('密钥已添加'); }
							});
						},
					}, '添加密钥'),
					react.createElement('button', {
						className: 'dst-btn', disabled: busy || keys.length === 0,
						onClick: () => run(() => api('/usage/refresh', {}), '已完成全部密钥的用量刷新').then((r) => {
							if (r && r.ok && r.results) {
								const bad = Object.entries(r.results).filter(([, v]) => v.ok === false);
								if (bad.length) setError('部分密钥用量刷新失败：' + bad.map(([id, v]) => id + ': ' + v.error).join('；'));
							}
						}),
					}, '刷新全部用量')
				),

				message && react.createElement('p', { className: 'dst-msg' }, message),
				error && react.createElement('p', { className: 'dst-err' }, error),

				react.createElement('p', { className: 'dst-hint' },
					'密钥保存在本机 ', react.createElement('code', null, state.dataPath || '<profile>/dsh-tavily.json'),
					'，不会上传；界面上仅显示脱敏形式。「测试」会真实发起一次 basic 搜索（消耗 1 积分）。余额优先模式依据「刷新用量」获得的官方额度数据排序，每次成功调用后会本地累加已用积分。失败自动切换下一把密钥；鉴权失败或额度用尽的密钥将冷却 5 分钟。',
					state.settingsBound ? '' : '（警告：settings 服务未接入，开关无法持久化。）'
				)
			);
		}

		function apply(ctx) {
			const styleEl = document.createElement('style');
			styleEl.setAttribute('data-plugin', 'dsh-tavily');
			styleEl.textContent = CSS;
			document.head.appendChild(styleEl);
			ctx.effect(() => () => {
				if (styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl);
			}, 'dsh-tavily: styles');

			ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
				name: 'settings.plugin.item',
				key: 'dsh-tavily',
				inject: () => ({}),
			}, TavilyCard));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
