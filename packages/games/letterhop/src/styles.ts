// Scoped game CSS (adopted inside the shadow root): a night pond with lily-pad rungs, candy letter tiles,
// candy keys and Hop the frog. Animations are off under [data-motion=reduced] and prefers-reduced-motion.
import { FONT_DISPLAY, FONT_STACK, colors as c } from '@pocketcade/toolkit';
import { RIPPLES, padSvg, svgUrl } from './art.ts';

/** candy surface: gloss band + face gradient, an outline and a darker lip underneath */
const candy = (top: string, bottom: string, lip: string, line: string) =>
  `background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0) 48%),linear-gradient(180deg,${top},${bottom});` +
  `border:2px solid ${line};box-shadow:0 4px 0 ${lip},0 6px 6px rgba(4,2,16,.4);`;
const PAD = svgUrl(padSvg('pad'));

export const styles = `
.lh{position:absolute;inset:0;isolation:isolate;container-type:size;display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px;padding:10px;box-sizing:border-box;overflow:hidden;
background:radial-gradient(ellipse at 15% 0,rgba(255,79,163,.18),transparent 55%),linear-gradient(180deg,#1E1158 0%,#182A66 50%,#0E3B52 100%);font-family:${FONT_STACK}}
.lh *{box-sizing:border-box}
.scene{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
.fly{position:absolute;z-index:-1;border-radius:50%;background:#E6FF7A;box-shadow:0 0 8px 3px rgba(230,255,122,.6);pointer-events:none;will-change:opacity;animation:twinkle 3.2s ease-in-out infinite}
.fly:nth-of-type(2n){animation-delay:-1.1s}.fly:nth-of-type(3n){animation-delay:-2.2s}
@keyframes twinkle{0%,100%{opacity:.1}50%{opacity:.9}}

/* ─── buttons ─── */
button{min-width:44px;min-height:44px;padding:6px 14px;border-radius:14px;font:600 16px/1.1 ${FONT_DISPLAY};cursor:pointer;color:${c.text};
display:inline-flex;align-items:center;justify-content:center;gap:6px;${candy('#3A2C86', '#2A1F60', '#140D38', '#4F3FA8')}transition:transform .08s,box-shadow .08s}
button:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 #140D38,0 2px 4px rgba(4,2,16,.45)}
button svg{width:20px;height:20px;flex:none}
button.primary{color:${c.ink};${candy('#FF7DBA', '#FF9F1C', '#B4520A', '#8A3A06')}}
button.primary:active:not(:disabled){box-shadow:0 1px 0 #B4520A}
button.go{color:${c.ink};font-size:19px;${candy('#E4FF8C', '#8FDB3A', '#3F8A1A', '#2C6410')}}
button.go:active:not(:disabled){box-shadow:0 1px 0 #3F8A1A}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid ${c.yellow};outline-offset:2px}
button:disabled{opacity:.45;cursor:default}
[hidden]{display:none!important}

/* ─── header ─── */
.top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-right:52px}
.tabs,.tiers{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:rgba(18,12,44,.6);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)}
.tabs button,.tiers button{border-radius:999px;background:none;border-color:transparent;box-shadow:none;color:${c.textMuted}}
.tabs button[aria-selected=true],.tiers button[aria-checked=true]{color:${c.ink};${candy('#E4FF8C', '#9BE34C', '#4F8E1E', '#3B6E14')}}
.label,.count,.streak{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 14px;border-radius:999px;background:rgba(18,12,44,.66);
box-shadow:inset 0 0 0 2px rgba(255,255,255,.12);font:600 16px/1 ${FONT_DISPLAY}}
.label{color:${c.textMuted}}
.count{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
.count::before{content:'';width:22px;height:14px;background:${PAD} center/contain no-repeat}
.streak{color:${c.gold};font-weight:700}
.streak svg{width:20px;height:20px}
.help-menu,.confirm,.banner{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;padding:10px;border-radius:18px;
background:rgba(42,31,96,.85);box-shadow:inset 0 0 0 2px rgba(255,255,255,.1)}
.tiers{margin-top:8px}

/* ─── the pond and its ladder ─── */
.main{display:grid;gap:12px;min-height:0}
.lh[data-layout=wide] .main{grid-template-columns:55% 1fr}
.lh:not([data-layout=wide]) .main{grid-template-rows:minmax(0,1fr) auto}
/* tile size: fit every rung (--rows, set by the game) in the pond, 40–58 px; beyond that the pond scrolls */
.ladder-wrap>*{--d:clamp(40px,min(14cqw,calc((100cqh - 30px - 6px * var(--rows,6)) / (1.34 * var(--rows,6) + .4))),58px);--g:6px}
.ladder-wrap{container-type:size;position:relative;overflow:auto;min-height:0;border-radius:24px;padding:14px 8px;
background:${svgUrl(RIPPLES)} 0 0/240px 240px,radial-gradient(ellipse at 50% 115%,rgba(56,214,255,.28),transparent 60%),linear-gradient(180deg,#123E63,#0C2846);
box-shadow:inset 0 0 0 2px rgba(127,224,255,.12),inset 0 10px 24px rgba(4,2,16,.45)}
.ladder-wrap>ol{list-style:none;margin:0;padding:0;min-height:100%;display:flex;flex-direction:column;gap:calc(var(--d)*.34 + 6px);align-items:center}
.ladder-wrap>ol>:first-child{margin-top:auto}.ladder-wrap>ol>:last-child{margin-bottom:auto}
.rung{display:flex;gap:var(--g);align-items:center;justify-content:center;position:relative;width:100%;isolation:isolate;padding:2px 0}
.rung::before{content:'';position:absolute;z-index:-1;left:50%;bottom:calc(var(--d)*-.3);width:calc(var(--d)*6.4 + 3*var(--g));height:calc(var(--d)*.72);
transform:translateX(-56%);background:${PAD} center/100% 100% no-repeat}
.rung.goal::before{background-image:${svgUrl(padSvg('goal'))}}
.rung.empty::before{background-image:${svgUrl(padSvg('ghost'))}}
.rung.draft::before{opacity:.95}
.rung.draft::after{content:'';position:absolute;z-index:-2;left:50%;bottom:calc(var(--d)*-.5);width:calc(var(--d)*6);height:calc(var(--d)*1.1);transform:translateX(-54%);background:radial-gradient(closest-side,rgba(184,243,74,.4),rgba(184,243,74,0))}
.rung.goal{position:sticky;top:-14px;z-index:2;padding:8px 0 calc(var(--d)*.36);margin-bottom:calc(var(--d)*-.3);
background:radial-gradient(ellipse 52% 62% at 47% 50%,rgba(9,30,56,.92) 55%,rgba(9,30,56,0))}

/* letter tiles: candy keys */
.bead{width:var(--d);height:var(--d);min-width:0;min-height:0;padding:0;border-radius:calc(var(--d)*.26);display:grid;place-items:center;position:relative;
font:700 calc(var(--d)*.56)/1 ${FONT_DISPLAY};text-transform:uppercase;color:${c.ink};${candy('#FFFBF3', '#EED8B8', '#A8865C', '#6E5232')}}
.bead.changed{transform:translateY(-4px);${candy('#E4FF8C', '#9BE34C', '#4F8E1E', '#2F5A0E')}}
.bead.changed::after{content:'';position:absolute;top:-8px;right:-8px;width:18px;height:18px;background:#fff;
clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}
.start .bead{${candy('#B4F1FF', '#38C8F0', '#1A7299', '#0E4A63')}}
.goal .bead{${candy('#FFF3A8', '#FFC23D', '#B86E0C', '#7A4A00')}box-shadow:0 4px 0 #B86E0C,0 0 18px rgba(255,200,61,.55)}
.rung.empty .bead{background:rgba(255,255,255,.05);border:2px dashed rgba(184,243,74,.35);box-shadow:none}
.draft .bead{color:${c.text};background:rgba(255,255,255,.12);border:2.5px dashed ${c.lime};box-shadow:0 0 0 0 transparent}
.draft button.bead{cursor:pointer}
.draft button.bead[aria-pressed=true]{color:${c.ink};border-style:solid;${candy('#F2FFB8', '#B8F34A', '#5E9A1E', '#2F5A0E')}}
.draft button.bead[aria-pressed=true]::before{content:'';position:absolute;inset:-7px;border-radius:inherit;border:3px solid ${c.lime};pointer-events:none;will-change:opacity,transform;animation:pick 1.1s ease-in-out infinite}
@keyframes pick{0%,100%{opacity:.15;transform:scale(.94)}50%{opacity:.9;transform:none}}
.draft.shake,.controls.shake{animation:shake .32s}
@keyframes shake{20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}

/* Hop the frog */
.hop{position:absolute;z-index:3;pointer-events:none;width:calc(var(--d)*1.2);height:calc(var(--d)*1.11);
margin-left:calc(var(--d)*-3.26 - var(--g)*1.5);margin-top:calc(var(--d)*-.87)}
.frog{width:100%;height:100%;display:block;overflow:visible;transform-origin:50% 95%;will-change:transform;animation:idle 2.6s ease-in-out infinite}
.frog .lids ellipse{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0);animation:blink 4.2s infinite}
@keyframes blink{0%,94%,100%{transform:scaleY(0)}96%{transform:scaleY(1)}}
@keyframes idle{50%{transform:scale(1.03,.97)}}
.frog .m-happy,.frog .m-sad,.frog .e-happy,.frog .brow{display:none}
.hop[data-mood=happy] .m-idle,.hop[data-mood=happy] .eyes,.hop[data-mood=sad] .m-idle{display:none}
.hop[data-mood=happy] .m-happy,.hop[data-mood=happy] .e-happy,.hop[data-mood=sad] .m-sad,.hop[data-mood=sad] .brow{display:inline}
.hop[data-mood=sad] .pupils{transform:translateY(2px)}
.hop.jump{animation:jump .5s cubic-bezier(.3,.7,.4,1)}
.hop.jump .frog{animation:squash .5s ease-out}
@keyframes jump{0%{transform:translate(var(--dx,0),var(--dy,0))}45%{transform:translate(calc(var(--dx,0)*.45),calc(var(--dy,0)*.45 - var(--d)*.9))}100%{transform:none}}
@keyframes squash{0%{transform:scale(1.15,.8)}25%{transform:scale(.85,1.2)}80%{transform:scale(1.12,.86)}100%{transform:none}}
.hop.party .frog{animation:party .55s ease-in-out infinite alternate}
@keyframes party{0%{transform:translateY(0) scale(1.08,.92)}100%{transform:translateY(calc(var(--d)*-.45)) scale(.95,1.06)}}
.splash{position:absolute;z-index:2;width:calc(var(--d)*1.1);height:calc(var(--d)*.34);margin-left:calc(var(--d)*-3.21 - var(--g)*1.5);margin-top:calc(var(--d)*.02);pointer-events:none}
.splash::before,.splash::after{content:'';position:absolute;inset:0;border:3px solid rgba(190,240,255,.85);border-radius:50%;animation:ripple .7s ease-out forwards}
.splash::after{animation-delay:.14s}
@keyframes ripple{from{transform:scale(.3);opacity:1}to{transform:scale(2.2);opacity:0}}
.spark{position:absolute;z-index:4;width:14px;height:14px;margin:-7px;pointer-events:none;background:var(--c,${c.lime});
clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:spark .75s ease-out forwards}
@keyframes spark{from{transform:rotate(var(--a)) translateX(10px) scale(.4);opacity:1}to{transform:rotate(var(--a)) translateX(var(--r,90px)) scale(1.1);opacity:0}}
.confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5}
.confetti i{position:absolute;top:-16px;width:10px;height:14px;border-radius:3px;animation:fall 1.7s cubic-bezier(.3,.6,.6,1) forwards}
@keyframes fall{to{transform:translate(var(--x),var(--fall,420px)) rotate(var(--r));opacity:.2}}

/* ─── controls: entry field, candy keyboard, actions ─── */
.controls{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto;padding:10px;border-radius:24px;background:rgba(18,12,44,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)}
label.field{display:flex;flex-direction:column;gap:6px;font:600 15px/1.2 ${FONT_DISPLAY};color:${c.textMuted}}
input{min-height:56px;padding:8px 16px;border:3px solid ${c.lime};border-radius:16px;background:rgba(8,20,40,.75);color:${c.text};
font:700 28px/1 ${FONT_DISPLAY};letter-spacing:.4em;text-transform:uppercase;user-select:text;-webkit-user-select:text;box-shadow:inset 0 4px 10px rgba(4,2,16,.5),0 0 16px rgba(184,243,74,.25)}
/* 7 keys a row, fewer when a key would be under 44 px wide */
.picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(max(44px,calc((100% - 36px) / 7)),1fr));gap:6px}
.picker button{padding:0;min-height:46px;font-size:20px;font-weight:700;text-transform:uppercase;color:${c.ink};${candy('#FBF8FF', '#D8CBFF', '#7D68D6', '#5B48B0')}}
.picker button:active{box-shadow:0 1px 0 #7D68D6}
.picker :is([data-letter=a],[data-letter=e],[data-letter=i],[data-letter=o],[data-letter=u]){${candy('#F1FCFF', '#BDEFFF', '#3E9CC2', '#22718F')}}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.actions button{flex:1 1 auto;padding:6px 10px}
.actions .go{flex:1 1 96px;min-height:52px}
.actions [data-act=mode]{flex:0 0 auto;min-height:40px;font-size:14px;color:${c.textMuted};background:none;border-color:rgba(255,255,255,.2);box-shadow:none}
.tip{margin:0;font:600 15px/1.35 ${FONT_DISPLAY};color:${c.textMuted}}
.tip b{color:${c.lime};letter-spacing:.06em}
.msg{min-height:1.4em;margin:0;font:700 15px/1.3 ${FONT_DISPLAY};color:#FFB8BA}
.msg:not(:empty){padding:8px 14px;border-radius:14px;background:rgba(255,90,95,.16);box-shadow:inset 0 0 0 2px rgba(255,90,95,.6)}

/* ─── results ─── */
.results{overflow:auto;padding:16px;border-radius:24px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;
background:linear-gradient(180deg,rgba(42,31,96,.92),rgba(29,21,70,.92));box-shadow:inset 0 0 0 2px rgba(255,255,255,.1),0 10px 30px rgba(4,2,16,.4)}
.results h2{margin:0;font:700 28px/1.1 ${FONT_DISPLAY};color:${c.lime}}
.results h3{margin:6px 0 0;font:600 15px/1.2 ${FONT_DISPLAY};color:${c.textMuted}}
.results p{margin:0}
.words{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.words li{padding:5px 10px;border-radius:10px;font:700 16px/1 ${FONT_DISPLAY};text-transform:uppercase;letter-spacing:.08em;color:${c.ink};${candy('#FFFBF3', '#EED8B8', '#A8865C', '#6E5232')}}
.leaves{display:flex;gap:4px}
.leaves svg{width:30px;height:30px}
.dialog{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,6,30,.8);z-index:6}
.dialog>div{width:min(420px,92%);padding:18px;border-radius:24px;background:${c.raised};display:flex;flex-direction:column;gap:10px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.12),0 20px 40px rgba(4,2,16,.5)}
.dialog h2{margin:0;font:700 22px/1.2 ${FONT_DISPLAY}}
textarea{min-height:120px;padding:10px;background:${c.bg};color:${c.text};border:2px solid ${c.line};border-radius:12px;font:14px/1.4 ui-monospace,monospace;user-select:text;-webkit-user-select:text}
.lh[data-motion=reduced] *,.lh[data-motion=reduced] *::before,.lh[data-motion=reduced] *::after{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){.lh *,.lh *::before,.lh *::after{animation:none!important;transition:none!important}}
`;
