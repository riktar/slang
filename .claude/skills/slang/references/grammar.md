# SLANG Formal Grammar (EBNF)

Complete formal grammar for SLANG v0.7.5.

## Lexical Elements

```ebnf
(* Whitespace and comments *)
WHITESPACE  = { " " | "\t" | "\r" | "\n" } ;
COMMENT     = "--" { ANY_CHAR - "\n" } "\n" ;

(* Identifiers and literals *)
IDENT       = LETTER { LETTER | DIGIT | "_" } ;
STRING      = '"' { ANY_CHAR - '"' } '"' ;
NUMBER      = [ "-" ] DIGIT { DIGIT } [ "." DIGIT { DIGIT } ] ;
BOOLEAN     = "true" | "false" ;
AGENT_REF   = "@" ( IDENT | "all" | "any" | "out" | "Human" ) ;

LETTER      = "a"-"z" | "A"-"Z" | "_" ;
DIGIT       = "0"-"9" ;
```

## Program Structure

```ebnf
program         = { flow_decl } ;

flow_decl       = "flow" STRING [ flow_params ] "{" flow_body "}" ;

flow_params     = "(" flow_param { "," flow_param } ")" ;
flow_param      = IDENT ":" STRING ;

flow_body       = { import_stmt | agent_decl | converge_stmt | budget_stmt | deliver_stmt | expect_stmt } ;

import_stmt     = "import" STRING "as" IDENT ;

deliver_stmt    = "deliver" ":" func_call ;

expect_stmt     = "expect" expression ;
```

## Agents

```ebnf
agent_decl      = "agent" IDENT "{" agent_body "}" ;

agent_body      = { agent_meta | operation } ;

agent_meta      = role_decl | model_decl | tools_decl | retry_decl ;

role_decl       = "role" ":" STRING ;
model_decl      = "model" ":" STRING ;
tools_decl      = "tools" ":" list_literal ;
retry_decl      = "retry" ":" NUMBER ;
```

## Operations

```ebnf
operation       = stake_op | await_op | commit_op | escalate_op | when_block
                | let_op | set_op | repeat_block ;

stake_op        = [ ( "let" | "set" ) IDENT "=" ] "stake" func_call [ "->" recipient_list ] [ condition ] [ output_schema ] ;

output_schema   = "output" ":" "{" output_field { "," output_field } "}" ;
output_field    = IDENT ":" STRING ;

await_op        = "await" IDENT "<-" source_list [ "(" await_opts ")" ] ;

commit_op       = "commit" [ expression ] [ condition ] ;

escalate_op     = "escalate" AGENT_REF [ "reason" ":" STRING ] [ condition ] ;

when_block      = "when" expression "{" { operation } "}" [ else_block ] ;

else_block      = ( "else" | "otherwise" ) "{" { operation } "}" ;

let_op          = "let" IDENT "=" expression ;

set_op          = "set" IDENT "=" expression ;

repeat_block    = "repeat" "until" expression "{" { operation } "}" ;
```

## Function Calls & Arguments

```ebnf
func_call       = IDENT "(" [ arg_list ] ")" ;

arg_list        = argument { "," argument } ;

argument        = [ IDENT ":" ] expression ;
```

## Recipients, Sources & Conditions

```ebnf
recipient_list  = recipient { "," recipient } ;
recipient       = AGENT_REF ;

source_list     = source { "," source } ;
source          = AGENT_REF | "*" ;

await_opts      = await_opt { "," await_opt } ;
await_opt       = IDENT ":" expression ;

condition       = "if" expression ;
```

## Flow Constraints

```ebnf
converge_stmt   = "converge" "when" ":" expression ;

budget_stmt     = "budget" ":" budget_item { "," budget_item } ;

budget_item     = ( "tokens" | "rounds" | "time" ) "(" expression ")" ;
```

## Expressions

```ebnf
expression      = comparison ;

comparison      = containment [ comp_op containment ] ;

comp_op         = ">" | ">=" | "<" | "<=" | "==" | "!=" | "&&" | "||" ;

containment     = access [ "contains" access ] ;

access          = primary { "." IDENT } ;

primary         = NUMBER
                | STRING
                | BOOLEAN
                | IDENT
                | AGENT_REF
                | list_literal
                | "(" expression ")"
                ;

list_literal    = "[" [ expression { "," expression } ] "]" ;
```

## Reserved Words

```
flow, agent, stake, await, commit, escalate, import, as,
when, if, else, otherwise, converge, budget, role, model, tools,
tokens, rounds, time, count, reason, retry, output, deliver,
let, set, repeat, until, expect, contains,
true, false,
@out, @all, @any, @Human
```
