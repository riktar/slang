# SLANG Formal Grammar (EBNF)

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

## Grammar Rules

```ebnf
(* Top-level *)
program         = { flow_decl } ;

flow_decl       = "flow" STRING "{" flow_body "}" ;

flow_body       = { import_stmt | agent_decl | converge_stmt | budget_stmt } ;

(* Import *)
import_stmt     = "import" STRING "as" IDENT ;

(* Agent *)
agent_decl      = "agent" IDENT "{" agent_body "}" ;

agent_body      = { agent_meta | operation } ;

agent_meta      = role_decl | model_decl | tools_decl ;

role_decl       = "role" ":" STRING ;
model_decl      = "model" ":" STRING ;
tools_decl      = "tools" ":" list_literal ;

(* Operations *)
operation       = stake_op | await_op | commit_op | escalate_op | when_block ;

stake_op        = "stake" func_call "->" recipient_list [ condition ] ;

await_op        = "await" IDENT "<-" source_list [ "(" await_opts ")" ] ;

commit_op       = "commit" [ expression ] [ condition ] ;

escalate_op     = "escalate" AGENT_REF [ "reason" ":" STRING ] [ condition ] ;

when_block      = "when" expression "{" { operation } "}" ;

(* Function calls *)
func_call       = IDENT "(" [ arg_list ] ")" ;

arg_list        = argument { "," argument } ;

argument        = [ IDENT ":" ] expression ;

(* Recipients and sources *)
recipient_list  = recipient { "," recipient } ;
recipient       = AGENT_REF ;

source_list     = source { "," source } ;
source          = AGENT_REF | "*" ;

await_opts      = await_opt { "," await_opt } ;
await_opt       = IDENT ":" expression ;

(* Conditions *)
condition       = "if" expression ;

(* Flow constraints *)
converge_stmt   = "converge" "when" ":" expression ;

budget_stmt     = "budget" ":" budget_item { "," budget_item } ;

budget_item     = ( "tokens" | "rounds" | "time" ) "(" expression ")" ;

(* Expressions *)
expression      = comparison ;

comparison      = access [ comp_op access ] ;

comp_op         = ">" | ">=" | "<" | "<=" | "==" | "!=" | "&&" | "||" ;

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
