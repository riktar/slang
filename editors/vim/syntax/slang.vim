" Vim syntax file
" Language: SLANG — Super Language for Agent Negotiation & Governance
" Maintainer: riktar
" Latest Revision: 2026-03-12
" Repository: https://github.com/riktar/slang

if exists("b:current_syntax")
  finish
endif

" ─── Comments ───
syn match slangComment "--.*$" contains=@Spell

" ─── Strings ───
syn region slangString start=/"/ skip=/\\"/ end=/"/ contains=slangEscape
syn match slangEscape /\\[nrt"\\]/ contained

" ─── Numbers ───
syn match slangNumber /\<[0-9]\+\(\.[0-9]\+\)\?\>/

" ─── Booleans ───
syn keyword slangBoolean true false

" ─── Primitives (core 3 + escalate) ───
syn keyword slangPrimitive stake await commit escalate

" ─── Flow/Structure keywords ───
syn keyword slangStructure flow agent import as deliver

" ─── Conditional/Loop ───
syn keyword slangConditional when if else otherwise
syn keyword slangRepeat repeat until

" ─── Constraint keywords ───
syn keyword slangConstraint converge budget

" ─── Testing keywords ───
syn keyword slangTest expect contains

" ─── Meta keywords ───
syn keyword slangMeta role model tools tokens rounds time count reason retry output

" ─── Variable keywords ───
syn keyword slangVariable let set

" ─── Agent references (@Name) ───
syn match slangAgentRef /@[A-Za-z_][A-Za-z0-9_]*/

" ─── Agent declaration name ───
syn match slangAgentDecl /\<agent\s\+\zs[A-Z][A-Za-z0-9_]*/

" ─── Flow name ───
syn match slangFlowName /\<flow\s\+\zs"[^"]*"/

" ─── Operators ───
syn match slangArrow /->/
syn match slangArrow /<-/
syn match slangOperator /==\|!=\|>=\|<=\|>\|</
syn match slangOperator /&&\|||\|=/

" ─── Highlight groups ───
hi def link slangComment Comment
hi def link slangString String
hi def link slangEscape SpecialChar
hi def link slangNumber Number
hi def link slangBoolean Boolean
hi def link slangPrimitive Keyword
hi def link slangStructure Structure
hi def link slangConditional Conditional
hi def link slangRepeat Repeat
hi def link slangConstraint PreProc
hi def link slangTest Keyword
hi def link slangMeta Type
hi def link slangVariable Statement
hi def link slangAgentRef Identifier
hi def link slangAgentDecl Function
hi def link slangFlowName String
hi def link slangArrow Operator
hi def link slangOperator Operator

let b:current_syntax = "slang"
