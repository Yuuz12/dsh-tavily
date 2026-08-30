window.__ModuleLoader__.load({
	id: 'dsh-tavily',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		let react = require('react');
		let _runtime_client = require('@deepseek-ai/dsh-client-store');

		const inject = ['slots', 'locale', 'connection', 'remote'];

		const ENDPOINT = '/dsh-tavily';
		const LOCALE_NS = 'dsh-tavily';

		// ---------------------------------------------------------------------
		// 样式：全部 --dsw-alias-* 主题令牌，明暗自适应。
		// 表单范式对齐内置插件卡片字段：标签在上、控件在下、
		// 字段间 border-top 分隔、成对设置走两列栅格。
		// ---------------------------------------------------------------------
		const CSS = [
			// —— 卡片骨架（对齐内置 PluginCard）——
			'.tvly-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background-color .16s}',
			'.tvly-card:hover{border-color:var(--dsw-alias-label-dimmed)}',
			'.tvly-card[data-open="true"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
			'.tvly-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}',
			'.tvly-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
			'.tvly-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}',
			'.tvly-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}',
			'.tvly-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
			'.tvly-chevron{flex:none;display:block;width:14px;height:14px;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
			'.tvly-chevron[data-open="true"]{transform:rotate(180deg)}',
			'.tvly-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:0 0 12px;color:var(--dsw-alias-label-primary);font-size:13px}',

			// —— 状态行 ——
			'.tvly-status{display:flex;align-items:flex-start;gap:8px;margin:10px 0 4px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);line-height:1.55;font-size:12px;color:var(--dsw-alias-label-secondary)}',
			'.tvly-dot{flex:none;width:8px;height:8px;border-radius:50%;margin-top:4px;background:var(--dsw-alias-label-faint,#9c9c9c)}',

			// —— 字段范式：分隔线 + 标签行 + 控件 ——
			'.tvly-field{padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2);min-width:0}',
			'.tvly-headrow{display:flex;align-items:center;gap:8px;margin-bottom:6px}',
			'.tvly-label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}',
			'.tvly-sub{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',

			// 主开关字段：左文案右开关
			'.tvly-togglefield{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}',
			'.tvly-texts{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',

			// 两列成对字段
			'.tvly-duo{display:grid;grid-template-columns:1fr 1fr;gap:0 18px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}',
			'.tvly-minifield{display:flex;flex-direction:column;gap:6px;min-width:0}',
			'.tvly-minihead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}',

			// 控件
			'.tvly-select,.tvly-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;transition:border-color .16s}',
			'.tvly-select:focus-visible,.tvly-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}',
			'.tvly-select:disabled,.tvly-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
			'.tvly-input::placeholder{color:var(--dsw-alias-label-faint,#9c9c9c)}',

			'.tvly-switch{position:relative;display:inline-block;width:36px;height:20px;flex:none;cursor:pointer}',
			'.tvly-switch input{position:absolute;inset:0;margin:0;opacity:0;cursor:pointer}',
			'.tvly-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-bg-module-platform);transition:background-color .16s;pointer-events:none}',
			'.tvly-switch-track::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform .16s,background-color .16s}',
			'.tvly-switch input:checked + .tvly-switch-track{background:var(--dsw-alias-brand-primary)}',
			// 选中态旋钮用主题底色令牌：暗色下是深色点、浅色下是白点，与品牌轨道恒有反差
			'.tvly-switch input:checked + .tvly-switch-track::after{transform:translateX(16px);background:var(--dsw-alias-bg-layer-3,#fff)}',
			'.tvly-switch input:focus-visible + .tvly-switch-track{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
			'.tvly-switch input:disabled + .tvly-switch-track{opacity:.4}',

			'.tvly-btn{appearance:none;font:inherit;font-size:12px;line-height:1.5;cursor:pointer;padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary);white-space:nowrap;transition:color .16s,border-color .16s,opacity .16s}',
			'.tvly-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
			'.tvly-btn:disabled{opacity:.4;cursor:default}',
			'.tvly-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
			'.tvly-btn-solid{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
			'.tvly-btn-solid:hover:not(:disabled){opacity:.9}',
			'.tvly-btn-danger:hover:not(:disabled){color:var(--dsw-alias-label-error,#d1242f);border-color:var(--dsw-alias-label-error,#d1242f)}',

			'.tvly-badge{display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}',
			'.tvly-badge-warn{color:#b45309}',
			'.tvly-badge-err{color:var(--dsw-alias-label-error,#d1242f)}',

			// —— 密钥列表 ——
			'.tvly-sechead{display:flex;align-items:center;gap:8px;margin-top:2px;padding:12px 0 8px;border-top:1px solid var(--dsw-alias-border-l2)}',
			'.tvly-sectitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.tvly-spacer{flex:1}',
			'.tvly-keys{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}',
			'.tvly-key{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;transition:border-color .16s}',
			'.tvly-key:hover{border-color:var(--dsw-alias-label-dimmed)}',
			'.tvly-key[data-disabled="true"]{opacity:.55}',
			'.tvly-key-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
			'.tvly-order{display:flex;flex-direction:column;gap:2px;flex:none}',
			'.tvly-arrow{appearance:none;font:inherit;font-size:9px;line-height:1;cursor:pointer;padding:2px 7px;color:var(--dsw-alias-label-secondary);background:none;border:1px solid var(--dsw-alias-border-l2);border-radius:4px}',
			'.tvly-arrow:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
			'.tvly-arrow:disabled{opacity:.35;cursor:default}',
			'.tvly-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-primary)}',
			'.tvly-labelinput{width:120px;height:26px;padding:0 8px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:6px}',
			'.tvly-labelinput:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}',

			'.tvly-balrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
			'.tvly-bar{position:relative;flex:1 1 140px;height:6px;min-width:110px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);overflow:hidden}',
			'.tvly-bar>i{position:absolute;top:0;bottom:0;left:0;border-radius:999px;transition:width .2s ease}',
			'.tvly-baltext{font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',

			'.tvly-stats{display:flex;gap:14px;flex-wrap:wrap;margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
			'.tvly-stats b{font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.tvly-lasterr{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-error,#d1242f);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

			'.tvly-msg{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-success-primary,#1a7f37)}',
			'.tvly-err{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#d1242f);white-space:pre-wrap}',
			'.tvly-hint{margin:0;padding:12px 0 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}',
			'.tvly-hint code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}',
		].join('\n');

		// ---------------------------------------------------------------------
		// 文案（zh 主，en 备）。组件优先取 props.t(key)，取不到回落中文表。
		// ---------------------------------------------------------------------
		const ZH = {
			title: 'Tavily 网页搜索',
			description: '多密钥池 · 余额优先轮流 · 失败自动切换 · 用量统计',
			statusActive: '已接管网页搜索：模型的 web_search 工具现在通过 Tavily 执行。',
			statusNoKeys: '开关已打开，但还没有可用密钥——当前仍由官方搜索兜底。请先在下方添加 API Key。',
			statusOff: '未接管：网页搜索仍由 DSH 官方提供方执行。',
			baseline: '基线',
			replace: '替换官方网页搜索',
			replaceOn: '开启中——web_search 走 Tavily',
			replaceOff: '关闭——web_search 走官方搜索',
			strategyLabel: '多密钥使用顺序',
			strategyBalance: '余额优先：剩余额度多的先用，同额轮流',
			strategyManual: '手动顺序：按下方列表从上到下',
			depthLabel: '搜索深度',
			maxResultsLabel: '单次结果上限',
			topicLabel: '搜索类别',
			answerLabel: 'AI 摘要回答',
			keysSection: 'API 密钥',
			test: '测试',
			enable: '启用',
			disable: '停用',
			remove: '删除',
			removeConfirm: '确定删除该密钥？其统计与用量缓存将一并清除。',
			noKeys: '还没有添加任何 Tavily API Key。',
			keyPlaceholder: '粘贴 Tavily API Key（tvly-…）',
			labelPlaceholder: '备注名（可选）',
			addKey: '添加密钥',
			refreshUsage: '刷新全部用量',
			keyAdded: '密钥已添加',
			usageRefreshed: '已完成全部密钥的用量刷新',
			unknownBalance: '余额未知——点上方「刷新全部用量」获取',
			staleData: '可能过期',
			cooling: '冷却中',
			disabledBadge: '已停用',
			formatWarn: '格式提醒',
			calls: '调用',
			successN: '成功',
			failedN: '失败',
			credits: '积分',
			lastLatency: '耗时',
			lastUsed: '最近使用',
			lastErrorPrefix: '最近错误：',
			searchHint: '「测试」会真实发起一次 basic 搜索（消耗 1 积分）；失败会自动切换下一把密钥，鉴权失败/额度用尽冷却 5 分钟。',
		}
		const EN = {
			title: 'Tavily web search',
			description: 'Multi-key pool · balance-first rotation · failover · usage stats',
			statusActive: 'Active: the model web_search tool now runs through Tavily.',
			statusNoKeys: 'Switch is on but no usable key — official search still serves. Add an API key below.',
			statusOff: 'Inactive: web search is served by the official provider.',
			baseline: 'baseline',
			replace: 'Replace official web search',
			replaceOn: 'On — web_search goes through Tavily',
			replaceOff: 'Off — web_search uses the official provider',
			strategyLabel: 'Multi-key order',
			strategyBalance: 'Balance first: highest remaining leads, ties rotate',
			strategyManual: 'Manual: top to bottom as listed below',
			depthLabel: 'Search depth',
			maxResultsLabel: 'Max results',
			topicLabel: 'Topic',
			answerLabel: 'AI answer',
			keysSection: 'API keys',
			test: 'Test',
			enable: 'Enable',
			disable: 'Disable',
			remove: 'Remove',
			removeConfirm: 'Remove this key? Its stats and cached usage will be cleared.',
			noKeys: 'No Tavily API key yet.',
			keyPlaceholder: 'Paste a Tavily API key (tvly-…)',
			labelPlaceholder: 'Label (optional)',
			addKey: 'Add key',
			refreshUsage: 'Refresh balances',
			keyAdded: 'Key added',
			usageRefreshed: 'Balances refreshed',
			unknownBalance: 'Unknown — click "Refresh balances"',
			staleData: 'stale?',
			cooling: 'cooling',
			disabledBadge: 'disabled',
			formatWarn: 'format',
			calls: 'calls',
			successN: 'ok',
			failedN: 'failed',
			credits: 'credits',
			lastLatency: 'latency',
			lastUsed: 'last used',
			lastErrorPrefix: 'Last error: ',
			searchHint: '"Test" runs one real basic search (1 credit). Failures roll over to the next key; auth/quota failures cool down for 5 minutes.',
		}

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

		/** 共享控制器：服务端状态快照 + 少量 UI 态，经 slots hooks 注入卡片。 */
		class TavilyController {
			constructor() {
				this.data = null;
				this.ui = { busy: false, message: '', error: '' };
				this.snapshot = { ready: false, data: null, busy: false, message: '', error: '' };
				this.store = _runtime_client.createSnapshotStore(this.snapshot);
			}
			async load() {
				try {
					const r = await api('/state');
					if (r && r.ok) this.data = r.state;
				} catch (e) { /* 首帧失败留给错误条：run/refresh 会再取 */ }
				this.publish();
			}
			publish() {
				this.snapshot = {
					ready: this.data !== null,
					data: this.data,
					busy: this.ui.busy,
					message: this.ui.message,
					error: this.ui.error,
				};
				this.store.set(this.snapshot);
			}
			async run(fn, okText) {
				this.ui.busy = true; this.ui.message = ''; this.ui.error = ''; this.publish();
				try {
					const r = await fn();
					if (r && r.state) this.data = r.state;
					if (r && r.ok) { if (typeof okText === 'string') this.ui.message = okText; }
					else this.ui.error = (r && r.error) || '操作失败';
					return r;
				} catch (e) {
					this.ui.error = (e && e.message ? e.message : String(e));
					return null;
				} finally {
					this.ui.busy = false;
					this.publish();
				}
			}
			patchConfig(patch, okText) { return this.run(() => api('/config', patch), okText); }
			addKey(key, label) { return this.run(() => api('/keys', { key: key.trim(), label: label.trim() }), ZH.keyAdded); }
			updateKey(id, patch) { return this.run(() => api('/keys/update', { id, ...patch })); }
			moveKey(id, dir) { return this.run(() => api('/keys/move', { id, dir })); }
			removeKey(id) { return this.run(() => api('/keys/remove', { id })); }
			testKey(id) { return this.run(() => api('/keys/test', { id })); }
			refreshUsage() { return this.run(() => api('/usage/refresh', {}), ZH.usageRefreshed); }
		}

		function chevron(open) {
			return react.createElement('svg', {
				className: 'tvly-chevron', 'data-open': open ? 'true' : 'false',
				width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true,
			}, react.createElement('path', {
				d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
				fill: 'currentColor',
			}));
		}

		function BalanceBar({ usage, stale }) {
			if (!usage) return react.createElement('span', { className: 'tvly-baltext' }, ZH.unknownBalance);
			// 口径选择：密钥级上限存在 → 按密钥口径；否则回退账户计划额度（多密钥共享）
			const hasKeyCap = usage.limit != null && usage.usage != null;
			const hasPlan = usage.planLimit != null;
			if (!hasKeyCap && !hasPlan) {
				return react.createElement('span', { className: 'tvly-baltext' }, ZH.unknownBalance);
			}
			let used; let limit; let prefix = '';
			if (hasKeyCap) { used = usage.usage; limit = usage.limit; }
			else { used = usage.planUsage ?? 0; limit = usage.planLimit; prefix = '计划 '; }
			const pct = limit ? Math.max(0, Math.min(100, (used / limit) * 100)) : 100;
			const color = limit == null
				? 'var(--dsw-alias-state-success-primary,#1a7f37)'
				: pct >= 80 ? 'var(--dsw-alias-label-error,#d1242f)' : pct >= 50 ? '#b45309' : 'var(--dsw-alias-state-success-primary,#1a7f37)';
			return react.createElement(react.Fragment, null,
				react.createElement('div', { className: 'tvly-bar', title: (prefix + fmtInt(used)) + (limit != null ? ' / ' + fmtInt(limit) : '') },
					react.createElement('i', { style: { width: pct + '%', background: color } })
				),
				react.createElement('span', { className: 'tvly-baltext' },
					prefix + fmtInt(used) + (limit != null ? ' / ' + fmtInt(limit) : '') +
					' · 剩余 ' + (limit == null ? '—' : fmtInt(limit - used)) +
					(usage.plan ? ' · ' + usage.plan : '')
				),
				stale && react.createElement('span', { className: 'tvly-badge' }, ZH.staleData)
			);
		}

		/** 一个 mini 字段：小标签在上、控件在下（用于两列栅格）。 */
		function MiniField({ label, extra, children }) {
			return react.createElement('div', { className: 'tvly-minifield' },
				react.createElement('span', { className: 'tvly-minihead' }, label, extra || null),
				children
			);
		}

		function KeyRow({ k, st, index, total, busy, ctrl }) {
			return react.createElement('li', { className: 'tvly-key', 'data-disabled': k.disabled ? 'true' : 'false' },
				react.createElement('div', { className: 'tvly-key-top' },
					react.createElement('span', { className: 'tvly-order' },
						react.createElement('button', {
							className: 'tvly-arrow', disabled: busy || index === 0, title: '上移',
							onClick: () => ctrl.moveKey(k.id, -1),
						}, '▲'),
						react.createElement('button', {
							className: 'tvly-arrow', disabled: busy || index === total - 1, title: '下移',
							onClick: () => ctrl.moveKey(k.id, 1),
						}, '▼')
					),
					react.createElement('span', { className: 'tvly-mono' }, '#' + (index + 1) + ' ' + k.masked),
					k.hasWarningPrefix && react.createElement('span', { className: 'tvly-badge tvly-badge-warn', title: 'Tavily 密钥通常以 tvly- 开头' }, ZH.formatWarn),
					st.cooling && react.createElement('span', { className: 'tvly-badge tvly-badge-warn' }, ZH.cooling),
					k.disabled && react.createElement('span', { className: 'tvly-badge' }, ZH.disabledBadge),
					react.createElement('span', { className: 'tvly-spacer' }),
					react.createElement('button', { className: 'tvly-btn', disabled: busy, onClick: () => ctrl.testKey(k.id) }, ZH.test),
					react.createElement('button', { className: 'tvly-btn', disabled: busy, onClick: () => ctrl.updateKey(k.id, { disabled: !k.disabled }) }, k.disabled ? ZH.enable : ZH.disable),
					react.createElement('button', {
						className: 'tvly-btn tvly-btn-danger', disabled: busy,
						onClick: () => { if (window.confirm(ZH.removeConfirm)) ctrl.removeKey(k.id); },
					}, ZH.remove)
				),
				react.createElement('div', { className: 'tvly-key-top' },
					react.createElement(BalanceBar, { usage: k.usage, stale: k.stale }),
					react.createElement('input', {
						className: 'tvly-labelinput',
						defaultValue: k.label || '', placeholder: '备注名', maxLength: 40, disabled: busy,
						key: 'lbl-' + k.id + '-' + (k.label || ''),
						onBlur: (e) => { const v = e.target.value.trim(); if (v !== (k.label || '')) ctrl.updateKey(k.id, { label: v }); },
						onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
					})
				),
				react.createElement('div', { className: 'tvly-stats' },
					react.createElement('span', null, ZH.calls, ' ', react.createElement('b', null, fmtInt(st.requests))),
					react.createElement('span', null, ZH.successN, ' ', react.createElement('b', null, fmtInt(st.success))),
					react.createElement('span', null, ZH.failedN, ' ', react.createElement('b', null, fmtInt(st.failed))),
					react.createElement('span', null, ZH.credits, ' ', react.createElement('b', null, fmtInt(st.creditsUsed))),
					st.lastLatencyMs != null && react.createElement('span', null, ZH.lastLatency, ' ', react.createElement('b', null, st.lastLatencyMs + 'ms')),
					st.lastUsedAt && react.createElement('span', null, ZH.lastUsed, ' ', new Date(st.lastUsedAt).toLocaleString())
				),
				st.lastError && react.createElement('p', { className: 'tvly-lasterr', title: st.lastError }, ZH.lastErrorPrefix + st.lastError)
			);
		}

		function TavilyCardBody({ state, ctrl, t }) {
			const T = (key) => {
				if (t) { try { const v = t(key); if (typeof v === 'string' && v.length > 0) return v; } catch (e) { /* fallthrough */ } }
				return ZH[key];
			};
			const [newKey, setNewKey] = react.useState('');
			const [newLabel, setNewLabel] = react.useState('');

			const busy = !!state.busy;
			const data = state.data;
			const cfg = (data && data.config) || {};
			const routing = (data && data.routing) || {};
			const keys = (data && Array.isArray(data.keys)) ? data.keys : [];
			const stats = (data && data.stats) || {};
			const usableCount = keys.filter((k) => !k.disabled).length;

			let statusColor = 'var(--dsw-alias-label-faint,#9c9c9c)';
			let statusText = T('statusOff');
			if (routing.active) {
				statusColor = 'var(--dsw-alias-state-success-primary,#1a7f37)';
				statusText = T('statusActive');
			} else if (cfg.enabled && usableCount === 0) {
				statusColor = '#b45309';
				statusText = T('statusNoKeys');
			}
			const baselineSuffix = routing.baselineId
				? `（${T('baseline')}: ${routing.baselineId}${routing.registeredProviders && routing.registeredProviders.length ? ' · ' + routing.registeredProviders.join(', ') : ''}）`
				: '';

			return react.createElement(react.Fragment, null,
				// 状态行
				react.createElement('p', { className: 'tvly-status' },
					react.createElement('span', { className: 'tvly-dot', style: { background: statusColor } }),
					react.createElement('span', null, statusText, baselineSuffix)
				),

				// 主开关
				react.createElement('div', { className: 'tvly-togglefield' },
					react.createElement('label', { className: 'tvly-switch' },
						react.createElement('input', {
							type: 'checkbox', role: 'switch', checked: cfg.enabled === true, disabled: busy,
							onChange: (e) => ctrl.patchConfig({ enabled: e.target.checked }),
						}),
						react.createElement('span', { className: 'tvly-switch-track', 'aria-hidden': true })
					),
					react.createElement('span', { className: 'tvly-texts' },
						react.createElement('span', { className: 'tvly-label' }, T('replace')),
						react.createElement('span', { className: 'tvly-sub' }, cfg.enabled ? T('replaceOn') : T('replaceOff'))
					)
				),

				// 多密钥策略（整行）
				react.createElement('div', { className: 'tvly-field' },
					react.createElement('div', { className: 'tvly-headrow' },
						react.createElement('span', { className: 'tvly-label' }, T('strategyLabel'))
					),
					react.createElement('select', {
						className: 'tvly-select', value: cfg.strategy || 'balance', disabled: busy,
						onChange: (e) => ctrl.patchConfig({ strategy: e.target.value }),
					},
						react.createElement('option', { value: 'balance' }, T('strategyBalance')),
						react.createElement('option', { value: 'manual' }, T('strategyManual'))
					)
				),

				// 搜索参数（两列 × 两行）
				react.createElement('div', { className: 'tvly-duo' },
					react.createElement(MiniField, { label: T('depthLabel') },
						react.createElement('select', {
							className: 'tvly-select', value: cfg.searchDepth || 'basic', disabled: busy,
							onChange: (e) => ctrl.patchConfig({ searchDepth: e.target.value }),
						},
							react.createElement('option', { value: 'basic' }, 'basic · 1 积分/次'),
							react.createElement('option', { value: 'advanced' }, 'advanced · 2 积分/次'),
							react.createElement('option', { value: 'fast' }, 'fast · 低延迟'),
							react.createElement('option', { value: 'ultra-fast' }, 'ultra-fast · 极速')
						)
					),
					react.createElement(MiniField, { label: T('topicLabel') },
						react.createElement('select', {
							className: 'tvly-select', value: cfg.topic || 'general', disabled: busy,
							onChange: (e) => ctrl.patchConfig({ topic: e.target.value }),
						},
							react.createElement('option', { value: 'general' }, 'general · 综合网页'),
							react.createElement('option', { value: 'news' }, 'news · 新闻'),
							react.createElement('option', { value: 'finance' }, 'finance · 财经')
						)
					),
					react.createElement(MiniField, { label: T('maxResultsLabel') },
						react.createElement('input', {
							className: 'tvly-input', type: 'number', min: 1, max: 20,
							defaultValue: cfg.maxResults != null ? String(cfg.maxResults) : '8',
							key: 'mr-' + cfg.maxResults, disabled: busy,
							onBlur: (e) => {
								const n = Number(e.target.value);
								if (Number.isInteger(n) && n >= 1 && n <= 20 && n !== cfg.maxResults) ctrl.patchConfig({ maxResults: n });
								else e.target.value = String(cfg.maxResults != null ? cfg.maxResults : 8);
							},
							onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
						})
					),
					react.createElement(MiniField, { label: T('answerLabel') },
						react.createElement('div', { style: { display: 'flex', alignItems: 'center', height: 32 } },
							react.createElement('label', { className: 'tvly-switch' },
								react.createElement('input', {
									type: 'checkbox', role: 'switch', checked: cfg.includeAnswer === true, disabled: busy,
									onChange: (e) => ctrl.patchConfig({ includeAnswer: e.target.checked }),
								}),
								react.createElement('span', { className: 'tvly-switch-track', 'aria-hidden': true })
							)
						)
					)
				),

				// 密钥区
				react.createElement('div', { className: 'tvly-sechead' },
					react.createElement('span', { className: 'tvly-sectitle' }, T('keysSection')),
					react.createElement('span', { className: 'tvly-badge' }, keys.length + (usableCount < keys.length ? ` / 可用 ${usableCount}` : '')),
					react.createElement('span', { className: 'tvly-spacer' }),
					react.createElement('button', { className: 'tvly-btn', disabled: busy || keys.length === 0, onClick: () => ctrl.refreshUsage() }, T('refreshUsage'))
				),
				react.createElement('ul', { className: 'tvly-keys' },
					keys.map((k, index) => react.createElement(KeyRow, {
						key: k.id, k, st: stats[k.id] || {}, index, total: keys.length, busy, ctrl,
					})),
					keys.length === 0 && react.createElement('li', { className: 'tvly-sub' }, T('noKeys'))
				),

				// 添加密钥
				react.createElement('div', { className: 'tvly-field' },
					react.createElement('div', { className: 'tvly-headrow' },
						react.createElement('span', { className: 'tvly-label' }, T('addKey'))
					),
					react.createElement('div', { className: 'tvly-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
						react.createElement('input', {
							className: 'tvly-input', style: { flex: '1 1 220px', width: 'auto' }, type: 'password', autoComplete: 'off',
							placeholder: T('keyPlaceholder'), value: newKey, disabled: busy,
							onChange: (e) => setNewKey(e.target.value),
						}),
						react.createElement('input', {
							className: 'tvly-input', style: { flex: '0 1 150px', width: 'auto' }, type: 'text',
							placeholder: T('labelPlaceholder'), value: newLabel, maxLength: 40, disabled: busy,
							onChange: (e) => setNewLabel(e.target.value),
						}),
						react.createElement('button', {
							className: 'tvly-btn tvly-btn-solid', style: { alignSelf: 'center' },
							disabled: busy || newKey.trim().length < 8,
							onClick: () => { ctrl.addKey(newKey, newLabel).then((r) => { if (r && r.ok) { setNewKey(''); setNewLabel(''); } }); },
						}, T('addKey'))
					)
				),

				state.message && react.createElement('p', { className: 'tvly-msg' }, state.message),
				state.error && react.createElement('p', { className: 'tvly-err' }, state.error),

				data && data.dataPath && react.createElement('p', { className: 'tvly-hint' },
					T('searchHint'),
					' 密钥仅存本机（',
					react.createElement('code', null, data.dataPath),
					'），界面只显示脱敏形式。'
				)
			);
		}

		/**
		 * 插件配置标签页的 keyed 卡片。结构对齐内置 PluginCard：
		 * li 折叠卡；数据经 slots hooks 注入（hooks.{handle:store} → props.use<Handle>）。
		 */
		function TavilyCard(props) {
			const t = props.t;
			const state = props.useTavilyCard((s) => s);
			const ctrl = props.tavilyCtrl;
			const [open, setOpen] = react.useState(false);
			return react.createElement('li', { className: 'tvly-card', 'data-open': open ? 'true' : 'false' },
				react.createElement('button', {
					type: 'button', className: 'tvly-head', 'aria-expanded': open,
					onClick: () => setOpen(!open),
				},
					react.createElement('span', { className: 'tvly-head-text' },
						react.createElement('span', { className: 'tvly-name' }, t ? t('title') : ZH.title),
						react.createElement('span', { className: 'tvly-desc' }, t ? t('description') : ZH.description)
					),
					chevron(open)
				),
				open ? react.createElement('div', { className: 'tvly-body' },
					!state.ready
						? react.createElement('p', { className: 'tvly-sub', style: { margin: '10px 0' } }, 'Loading…')
						: react.createElement(TavilyCardBody, { state, ctrl, t })
				) : null
			);
		}

		function apply(ctx) {
			ctx.effect(() => {
				const prev = document.querySelector('style[data-plugin-css="dsh-tavily"]');
				if (prev) prev.remove();
				const tag = document.createElement('style');
				tag.setAttribute('data-plugin', 'dsh-tavily');
				tag.setAttribute('data-plugin-css', 'dsh-tavily');
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => { if (tag.parentNode) tag.parentNode.removeChild(tag); };
			}, 'dsh-tavily: styles');

			ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: ZH, en: EN }), 'dsh-tavily: locale');

			const ctrl = new TavilyController();
			ctrl.load();

			ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
				name: 'settings.plugin.item',
				key: 'dsh-tavily',
				locale: LOCALE_NS,
				inject: () => ({
					hooks: { tavilyCard: ctrl.store },
					tavilyCtrl: ctrl,
				}),
			}, TavilyCard));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
