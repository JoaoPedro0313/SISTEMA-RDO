/* ============================================================================
   supabase-teste.js — MODO DE TESTE do Sistema RDO (pasta demo/)
   ----------------------------------------------------------------------------
   Faz o papel do Supabase com um banco simulado, guardado só neste navegador
   (IndexedDB) e já com dados de exemplo. A gestão e o app de teste rodam o
   mesmo código do sistema real; nada vai para o banco de verdade.
   Abertos no mesmo navegador, gestão e app de teste dividem os dados: o RDO
   enviado pelo app de teste aparece na gestão de teste na hora.
   Sem login: a gestão abre como gestor e o app como encarregado.
   ========================================================================== */
(function () {
  'use strict';

  var BASE = ((document.currentScript && document.currentScript.src) || location.href).replace(/[^\/]*$/, '');
  var TIPO = /\/campo(\/|\/index\.html)?$/.test(location.pathname) ? 'campo' : 'gestao';
  var NOME_DB = 'rdo-teste-banco';
  var CONTRATO = 'OBRAS - BA';
  var CATALOGO = [["BA_01","POSTE BT","UN",0,"LINHA MORTA"],["BA_02","POSTE AT","UN",0,"LINHA MORTA"],["BA_03","LOCAÇÃO","UN",0,"LINHA MORTA"],["BA_04","ENERGIZAÇÃO","UN",0,"LINHA MORTA"],["BA_05","DESCARREGAMENTO DE CONCRETO / FERRAGEM","UN",0,"LINHA MORTA"],["BA_06","DEVOLUÇÃO DE MATERIAL","UN",0,"LINHA MORTA"],["BA_07","LIGAÇÃO DE CLIENTE","UN",0,"LINHA MORTA"],["BA_08","DESLOCAMENTO","UN",0,"LINHA MORTA"],["BA_11","INSTALAR CONDUTOR NU","kg",2,"LINHA MORTA"],["BA_12","REALOCAR CONDUTOR NU","kg",2,"LINHA MORTA"],["BA_120","RETIRAR CONECTOR","UN",0,"LINHA MORTA"],["BA_125","RETIRAR ESTRUTURA N3.CE3 OU B3.CE3","UN",0,"LINHA MORTA"],["BA_16","RETIRAR CABO COBERTO ATE 70 MM2 - AT","M",2,"LINHA MORTA"],["BA_167","RETIRAR POSTE SUPERIOR A 14 METROS","UN",0,"LINHA MORTA"],["BA_17","PINTURAS DOS PGS","UN",0,"LINHA MORTA"],["BA_18","INSTALAR CABO COBERTO ACIMA 70 MM2 - AT","M",2,"LINHA MORTA"],["BA_24","INSTALAR CABO MULTIPLEX 35 A 70 MM2 - BT","M",2,"LINHA MORTA"],["BA_27","RETIRAR CABO MULTIPLEX DE 35 A 70 MM2 - BT","M",2,"LINHA MORTA"],["BA_277","INSTALAR TC PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_28","INSTALAR CABO MULTIPLEX ACIMA 70 MM2 - BT","M",2,"LINHA MORTA"],["BA_31","INSTALAR RAMAL DE LIGACAO MONOFASICO","UN",0,"LINHA MORTA"],["BA_379","CAVA MANUAL NORMAL","UN",0,"LINHA MORTA"],["BA_381","CAVA COM TRADO NORMAL","UN",0,"LINHA MORTA"],["BA_382","CAVA COM TRADO EM ROCHA","UN",0,"LINHA MORTA"],["BA_394","INSTALAR TRAFO MONOFASICO","UN",0,"LINHA MORTA"],["BA_400","RETIRAR TRAFO POLIFASICO PROVISORIO","UN",0,"LINHA MORTA"],["BA_401","RETIRAR TRAFO POLIFASICO","UN",0,"LINHA MORTA"],["BA_402","INSTALAR PARA-RAIOS < 34,5KV RD AEREA","UN",0,"LINHA MORTA"],["BA_406","RETIRAR PARA-RAIOS EM RD AEREA","UN",0,"LINHA MORTA"],["BA_41","FUNDACAO ESPECIAL","UN",0,"LINHA MORTA"],["BA_42","INSTALAR ESTAI EM SOLO","UN",0,"LINHA MORTA"],["BA_51","INSTALAR SECCIONAMENTO ESTAI","UN",0,"LINHA MORTA"],["BA_57","RETIRAR ISOLADOR BASTAO/DISCO","UN",0,"LINHA MORTA"],["BA_58","INSTALAR EST CRUZ SIMP ISOL PINO/PILAR","UN",0,"LINHA MORTA"],["BA_59","REALOCAR EST CRUZ SIMPL ISOL PINO/PILAR","UN",0,"LINHA MORTA"],["BA_64","INSTALAR EST CRUZ DUPLA 1 ANCORAGEM","UN",0,"LINHA MORTA"],["BA_67","INSTALAR EST CRUZ DUPLA 2 ANCORAGENS","UN",0,"LINHA MORTA"],["BA_226","REALOCAR EST CRUZ SIMP ISO PINO/PILAR LV","UN",0,"LINHA VIVA"],["BA_227","RETIRAR EST CRUZ SIMP ISOL PINO/PILAR LV","UN",0,"LINHA VIVA"],["BA_228","INST EST CRUZ DUPLA ISOL PINO/PILAR LV","UN",0,"LINHA VIVA"],["BA_230","REALOCAR EST CRUZ DUP ISOL PINO/PILAR LV","UN",0,"LINHA VIVA"],["BA_231","RETIRAR EST CRUZ DUPL ISOL PINO/PILAR LV","UN",0,"LINHA VIVA"],["BA_232","INST EST CRUZ DUPLA (1 ANCORAGEM) LV","UN",0,"LINHA VIVA"],["BA_273","REALOCAR CHAVE FACA LV","UN",0,"LINHA VIVA"],["BA_274","RETIRAR CHAVE FACA LV","UN",0,"LINHA VIVA"],["BA_275","INSTALAR EST CHAVE FUSIVEL 34,5KV LV","UN",0,"LINHA VIVA"],["BA_331","CORTE DE ARVORE DAP+10","UN",0,"PODA"],["BA_332","CORTE DE ARVORE DAP+45","UN",0,"PODA"],["BA_337","PODA URBANA","UN",0,"PODA"],["BA_338","PODA RURAL","UN",0,"PODA"],["BA_139","ABERTURA DE FAIXA MEIO MECANICO","m2",0,"RETRO"],["BA_329","LIMPEZA DE FAIXA MEIO MECANICO","m2",0,"RETRO"],["BA_383","RETRO - CAVA NORMAL","UN",0,"RETRO"],["BA_384","RETRO - CAVA EM ROCHA","UN",0,"RETRO"],["BA_385","RETRO - CAVA COM ROMPEDOR","UN",0,"RETRO"],["BA_09","MUDANÇA DE ALOJAMENTO","UN",0,"LINHA MORTA"],["BA_10","RETIRAR CONJ MEDICAO (TP/TC)","UN",0,"LINHA MORTA"],["BA_100","REALOCAR CHAVE FUSIVEL =34,5KV","UN",0,"LINHA MORTA"],["BA_101","RETIRAR CHAVE FUSIVEL =34,5KV","UN",0,"LINHA MORTA"],["BA_102","INSTALAR EST BT PARA COND MULTIPLEX","UN",0,"LINHA MORTA"],["BA_103","REALOCAR EST BT PARA COND MULTIPLEX","UN",0,"LINHA MORTA"],["BA_104","RETIRAR EST BT PARA COND MULTIPLEX","UN",0,"LINHA MORTA"],["BA_105","INSTALAR CHAVE FACA","UN",0,"LINHA MORTA"],["BA_106","REALOCAR CHAVE FACA","UN",0,"LINHA MORTA"],["BA_107","RETIRAR CHAVE FACA","UN",0,"LINHA MORTA"],["BA_108","INSTALAR EST CHAVE FUSIVEL 34,5KV","UN",0,"LINHA MORTA"],["BA_109","REALOCAR EST CHAVE FUSIVEL 34,5KV","UN",0,"LINHA MORTA"],["BA_110","SUBST EST CHAVE FUSIVEL 34,5KV","UN",0,"LINHA MORTA"],["BA_111","INSTALAR EST CHAVE FUSIVEL =34,5KV","UN",0,"LINHA MORTA"],["BA_112","REALOCAR EST CHAVE FUSIVEL =34,5KV","UN",0,"LINHA MORTA"],["BA_113","RETIRAR EST CHAVE FUSIVEL =34,5KV","UN",0,"LINHA MORTA"],["BA_114","INSTALAR ATERRAMENTO/SECCIONAMENTO CERCA","UN",0,"LINHA MORTA"],["BA_115","INSTALAR ATERRAMENTO LINHA/EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_116","INSTALAR ESTRIBO DE ATERRAMENTO","UN",0,"LINHA MORTA"],["BA_117","RETIRAR ESTRIBO DE ATERRAMENTO","UN",0,"LINHA MORTA"],["BA_118","INSTALAR/ADICIONAR HASTE DE ATERRAMENTO","UN",0,"LINHA MORTA"],["BA_119","RETIRAR HASTE DE ATERRAMENTO","UN",0,"LINHA MORTA"],["BA_121","INSTALAR JUMPER OU PASSAGEM DE NEUTRO","UN",0,"LINHA MORTA"],["BA_122",".","UN",0,"LINHA MORTA"],["BA_123","INSTALAR ESTRUTURA N3.CE3 OU B3.CE3","UN",0,"LINHA MORTA"],["BA_124","REALOCAR ESTRUTURA N3.CE3 OU B3.CE3","UN",0,"LINHA MORTA"],["BA_126","SOLDA EXOTERMICA","UN",0,"LINHA MORTA"],["BA_127","INSTALAR ESPACADOR DE BT","UN",0,"LINHA MORTA"],["BA_128","INSTALAR PLACA DA OBRA","UN",0,"LINHA MORTA"],["BA_129","RETIRAR PLACA DA OBRA","UN",0,"LINHA MORTA"],["BA_13","RETIRAR CONDUTOR NU","kg",2,"LINHA MORTA"],["BA_130","REALOCAR RAMAL","UN",0,"LINHA MORTA"],["BA_131","REALOCAR POSTE BT","UN",0,"LINHA MORTA"],["BA_132","REALOCAR POSTE AT","UN",0,"LINHA MORTA"],["BA_133","AVISO DE DESLIGAMENTO POR TRAFO","UN",0,"LINHA MORTA"],["BA_134","AVISO DE DESLIGAMENTO POR CLIENTE","UN",0,"LINHA MORTA"],["BA_135","ADITIVO AVISO DESLIGAM. CLIENTE ESPECIAL","UN",0,"LINHA MORTA"],["BA_136","RETIRAR POSTE BT","UN",0,"LINHA MORTA"],["BA_137","ARRASTAMENTO MATERIAL MANUAL","TKM",2,"LINHA MORTA"],["BA_138","ARRASTAMENTO MATERIAL USO EQUIPAMENTO","TKM",2,"LINHA MORTA"],["BA_14","INSTALAR CABO COBERTO ATE 70 MM2 -CABO AT","M",2,"LINHA MORTA"],["BA_15","REALOCAR CABO COBERTO ATE 70 MM2 -CABO AT","M",2,"LINHA MORTA"],["BA_150","INSTALAR POSTE SUPERIOR A 14 METROS","UN",0,"LINHA MORTA"],["BA_159","REALOCAR POSTE SUPERIOR A 14 METROS","UN",0,"LINHA MORTA"],["BA_184","INSTALAR CELULA CAPACITIVA","UN",0,"LINHA MORTA"],["BA_19","REALOCAR CABO COBERTO ACIMA 70 MM2 - AT","M",2,"LINHA MORTA"],["BA_192","REALOCAR CELULA CAPACITIVA","UN",0,"LINHA MORTA"],["BA_20","RETIRAR CABO COBERTO ACIMA 70 MM2 - AT","M",2,"LINHA MORTA"],["BA_200","RETIRAR CELULA CAPACITIVA","UN",0,"LINHA MORTA"],["BA_201","INSTALAR SUPORTE PARA BANCO CAPACITOR","UN",0,"LINHA MORTA"],["BA_202","REALOCAR SUPORTE PARA BANCO CAPACITOR","UN",0,"LINHA MORTA"],["BA_206","RETIRAR SUPORTE PARA BANCO CAPACITOR","UN",0,"LINHA MORTA"],["BA_21","INSTALAR CABO MULTIPLEX ATE 25 MM2 - BT","M",2,"LINHA MORTA"],["BA_217","INSTALAR COMANDO PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_22","REALOCAR CABO MULTIPLEX ATE 25 MM2 - BT","M",2,"LINHA MORTA"],["BA_221","REALOCAR COMANDO PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_229","RETIRAR COMANDO PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_23","RETIRAR CABO MULTIPLEX ATE 25 MM2 - BT","M",2,"LINHA MORTA"],["BA_246","INSTALAR TP PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_25","REALOCAR CABO MULTIPLEX 35 A 70 MM2 - BT","M",2,"LINHA MORTA"],["BA_255","REALOCAR TP PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_26","TRANSPORTE DE POSTE","UN",0,"LINHA MORTA"],["BA_263","RETIRAR TP PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_285","REALOCAR TC PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_29","REALOCAR CABO MULTIPLEX ACIMA 70 MM2  - BT","M",2,"LINHA MORTA"],["BA_295","RETIRAR TC PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_298","SUBST PARA-RAIOS EM RD AEREA","UN",0,"LINHA MORTA"],["BA_299","INSTALAR TERM DESC COND ISOLADO 12/20KV","UN",0,"LINHA MORTA"],["BA_30","RETIRAR CABO MULTIPLEX ACIMA 70 MM2 - BT","M",2,"LINHA MORTA"],["BA_300","INSTALAR TERM COND ISOLADO BT","UN",0,"LINHA MORTA"],["BA_301","INSTALAR EMENDA CONDUTORES ISOLADO BT","UN",0,"LINHA MORTA"],["BA_302","INSTALAR EMENDA CONDUTORES ISOLADO MT","UN",0,"LINHA MORTA"],["BA_303","INSTALAR TERM P/COND ISOLADO MT","UN",0,"LINHA MORTA"],["BA_304","INSTALAR CHAVE TRIPOLAR","UN",0,"LINHA MORTA"],["BA_305","INSTALAR TERM EXT/INT P/CABO","UN",0,"LINHA MORTA"],["BA_306","INSTALAR EMENDA MT","UN",0,"LINHA MORTA"],["BA_307","INSTALAR TERM/DESC MT","UN",0,"LINHA MORTA"],["BA_308","INSTALAR TERM MT","UN",0,"LINHA MORTA"],["BA_309","REALOCAR CHAVE TRIPOLAR","UN",0,"LINHA MORTA"],["BA_310","DESL CONJ ILUMIN PUB - BRACO CURTO/MEDIO","UN",0,"LINHA MORTA"],["BA_311","INST CONJ ILUMIN PUB - BRACO CURTO/MEDIO","UN",0,"LINHA MORTA"],["BA_312","RET CONJ ILUMIN PUB - BRACO CURTO/MEDIO","UN",0,"LINHA MORTA"],["BA_313","DESL CONJ ILUMIN PUB - BRACO LONGO","UN",0,"LINHA MORTA"],["BA_314","INST CONJ ILUMIN PUB - BRACO LONGO","UN",0,"LINHA MORTA"],["BA_315","RET CONJ ILUMIN PUB - BRACO LONGO","UN",0,"LINHA MORTA"],["BA_316","RETIRAR DEFENSA METALICA","UN",0,"LINHA MORTA"],["BA_317","RETIRAR CHAVE TRIPOLAR","UN",0,"LINHA MORTA"],["BA_318","SUBSTITUIR SECCIONAMENTO ESTAI","UN",0,"LINHA MORTA"],["BA_319","REALOCAR PINO COM ISOLADOR","UN",0,"LINHA MORTA"],["BA_32","REALOCAR RAMAL DE LIGACAO MONOFASICO","UN",0,"LINHA MORTA"],["BA_321","INSTALAR CHAVE FUSIVEL RELIGADORA","UN",0,"LINHA MORTA"],["BA_322","TENSIONAR E/OU FIXAR CONDUTOR","UN",0,"LINHA MORTA"],["BA_323","OPERAR CHAVE OU GLV","UN",0,"LINHA MORTA"],["BA_324","RETENSIONAR RAMAL","UN",0,"LINHA MORTA"],["BA_325","APRUMAR POSTE LM","UN",0,"LINHA MORTA"],["BA_326","REALOCAR CHAVE FUSIVEL RELIGADORA","UN",0,"LINHA MORTA"],["BA_327","INSTALAR ESPACADOR","UN",0,"LINHA MORTA"],["BA_328","RETIRAR CHAVE FUSIVEL RELIGADORA","UN",0,"LINHA MORTA"],["BA_33","RETIRAR RAMAL DE LIGACAO MONOFASICO","UN",0,"LINHA MORTA"],["BA_339","DISTRIBUICAO DE POSTES PARA OBRA","UN",0,"LINHA MORTA"],["BA_34","INSTALAR RAMAL DE LIGACAO POLIFASICO","UN",0,"LINHA MORTA"],["BA_341","INSTALAR CHAVE DE TRANSFERENCIA","UN",0,"LINHA MORTA"],["BA_347","REALOCAR CHAVE DE TRANSFERENCIA","UN",0,"LINHA MORTA"],["BA_348","RETIRAR CHAVE DE TRASFERENCIA","UN",0,"LINHA MORTA"],["BA_35","REALOCAR RAMAL DE LIGACAO POLIFASICO","UN",0,"LINHA MORTA"],["BA_355","INSTALAR REGULADOR DE TENSAO","UN",0,"LINHA MORTA"],["BA_358","REALOCAR REGULADOR DE TENSAO","UN",0,"LINHA MORTA"],["BA_36","RETIRAR RAMAL DE LIGACAO POLIFASICO","UN",0,"LINHA MORTA"],["BA_362","RETIRAR REGULADOR DE TENSAO","UN",0,"LINHA MORTA"],["BA_37","INSTALAR COND CU TERRA = < 50 MM2","kg",2,"LINHA MORTA"],["BA_377","INSTALAR RELIGADOR","UN",0,"LINHA MORTA"],["BA_38","RETIRAR COND CU NU = < 50MM2","kg",2,"LINHA MORTA"],["BA_380","CAVA MANUAL EM ROCHA","UN",0,"LINHA MORTA"],["BA_386","RETIRAR POSTE  AT","UN",0,"LINHA MORTA"],["BA_387","ESCAVAÇÃO PARA ESTAÍ","UN",0,"LINHA MORTA"],["BA_388","REALOCAR RELIGADOR","UN",0,"LINHA MORTA"],["BA_389","ESCAVAÇÃO PARA ESTAÍ EM ROCHA","UN",0,"LINHA MORTA"],["BA_39","INSTALAR COND CU TERRA >  50 MM2","kg",2,"LINHA MORTA"],["BA_390","RETIRAR RELIGADOR","UN",0,"LINHA MORTA"],["BA_391","INSTALAR SECCIONALIZADOR TRIPOLAR","UN",0,"LINHA MORTA"],["BA_392","REALOCAR SECCIONALIZADOR TRIPOLAR","UN",0,"LINHA MORTA"],["BA_393","RETIRAR SECCIONALIZADOR TRIPOLAR","UN",0,"LINHA MORTA"],["BA_395","REALOCAR TRAFO MONOFASICO","UN",0,"LINHA MORTA"],["BA_396","RETIRAR TRAFO MONOFASICO","UN",0,"LINHA MORTA"],["BA_397","INSTALAR TRAFO POLIFASICO PROVISORIO","UN",0,"LINHA MORTA"],["BA_398","INSTALAR TRAFO POLIFASICO","UN",0,"LINHA MORTA"],["BA_399","REALOCAR TRAFO POLIFASICO","UN",0,"LINHA MORTA"],["BA_40","RETIRAR COND CU NU > 50MM2","kg",2,"LINHA MORTA"],["BA_403","INSTALAR PARA-RAIOS EM RD AEREA","UN",0,"LINHA MORTA"],["BA_404","REALOCAR PARA-RAIOS EM RD AEREA","UN",0,"LINHA MORTA"],["BA_405","RETIRAR PARA-RAIOS","UN",0,"LINHA MORTA"],["BA_43","RETIRAR ESTAI EM SOLO","UN",0,"LINHA MORTA"],["BA_44","INSTALAR ESTAI AEREO","UN",0,"LINHA MORTA"],["BA_45","REALOCAR ESTAI AEREO","UN",0,"LINHA MORTA"],["BA_46","RETIRAR ESTAI AEREO","UN",0,"LINHA MORTA"],["BA_47","INSTALAR DEFENSACIRCULAR","UN",0,"LINHA MORTA"],["BA_48","INSTALAR DEFENSA DE CONCRETO","UN",0,"LINHA MORTA"],["BA_49","INSTALAR DEFENSA METALICA","UN",0,"LINHA MORTA"],["BA_50","CAVA EM ROCHA COM EXPLOSIVO","UN",0,"LINHA MORTA"],["BA_52","RETIRAR SECCIONAMENTO ESTAI","UN",0,"LINHA MORTA"],["BA_53","INSTALAR PINO COM ISOLADOR","UN",0,"LINHA MORTA"],["BA_54","RETIRAR PINO COM ISOLADOR","UN",0,"LINHA MORTA"],["BA_55","INSTALAR ISOLADOR BASTAO/DISCO","UN",0,"LINHA MORTA"],["BA_56","REALOCAR ISOLADOR BASTAO/DISCO","UN",0,"LINHA MORTA"],["BA_60","RETIRAR EST CRUZ SIMP ISOL PINO/PILAR","UN",0,"LINHA MORTA"],["BA_61","INSTALAR EST CRUZ DUPLA ISOL PINO/PILAR","UN",0,"LINHA MORTA"],["BA_62","REALOCAR EST CRUZ DUPLA ISOL PINO/PILAR","UN",0,"LINHA MORTA"],["BA_63","RETIRAR EST CRUZ DUPL ISOL PINO/PILAR","UN",0,"LINHA MORTA"],["BA_65","REALOCAR EST CRUZ DUPLA 1 ANCORAGEM","UN",0,"LINHA MORTA"],["BA_66","RETIRAR EST CRUZ DUPLA 1 ANCORAGEM","UN",0,"LINHA MORTA"],["BA_68","REALOCAR EST CRUZ DUPLA 2 ANCORAGENS","UN",0,"LINHA MORTA"],["BA_69","RETIRAR EST CRUZ DUPLA 2 ANCORAGENS","UN",0,"LINHA MORTA"],["BA_70","INSTALAR EST CRUZ PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_71","REALOCAR EST CRUZ PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_72","RETIRAR EST CRUZ PARA EQUIPAMENTO","UN",0,"LINHA MORTA"],["BA_73","INSTALAR EST CE1, CE1-E, CE1-A OU CE1A-E","UN",0,"LINHA MORTA"],["BA_74","REALOCAR EST CE1, CE1-E, CE1-A OU CE1A-E","UN",0,"LINHA MORTA"],["BA_75","RETIRAR EST CE1, CE1-E, CE1-A OU CE1A-E","UN",0,"LINHA MORTA"],["BA_76","INSTALAR EST CE2, CE2-E, CE3, CE3-E","UN",0,"LINHA MORTA"],["BA_77","REALOCAR EST CE2, CE2-E, CE3, CE3-E","UN",0,"LINHA MORTA"],["BA_78","RETIRAR ESTRUTURA CE2, CE2-E, CE3, CE3-E","UN",0,"LINHA MORTA"],["BA_79","INSTALAR ESTRUTURA CE3-CE3","UN",0,"LINHA MORTA"],["BA_80","REALOCAR ESTRUTURA CE3-CE3","UN",0,"LINHA MORTA"],["BA_81","RETIRAR ESTRUTURA CE3-CE3","UN",0,"LINHA MORTA"],["BA_82","INSTALAR ESTRUTURA CE1-3 OU CE1A-CE3","UN",0,"LINHA MORTA"],["BA_83","REALOCAR ESTRUTURA CE1-3 OU CE1A-CE3","UN",0,"LINHA MORTA"],["BA_84","RETIRAR ESTRUTURA CE1-3 OU CE1A-CE3","UN",0,"LINHA MORTA"],["BA_85","INSTALAR ESTRUTURA CE4 OU CE4-E","UN",0,"LINHA MORTA"],["BA_86","REALOCAR ESTRUTURA CE4 OU CE4-E","UN",0,"LINHA MORTA"],["BA_87","RETIRAR ESTRUTURA CE4 OU CE4-E","UN",0,"LINHA MORTA"],["BA_88","INSTALAR EST CHAVE FACA EM RD COMPACTA","UN",0,"LINHA MORTA"],["BA_89","REALOCAR EST CHAVE FACA EM RD COMPACTA","UN",0,"LINHA MORTA"],["BA_90","RETIRAR EST CHAVE FACA EM RD COMPACTA","UN",0,"LINHA MORTA"],["BA_91","INSTALAR ESTRUTURA LN1 LN2 LN3","UN",0,"LINHA MORTA"],["BA_92","REALOCAR ESTRUTURA LN1 LN2 LN3","UN",0,"LINHA MORTA"],["BA_93","RETIRAR ESTRUTURA LN1 LN2 LN3","UN",0,"LINHA MORTA"],["BA_94","INST ESTRUT P/EQUIP PLATAFORMA","UN",0,"LINHA MORTA"],["BA_95","INSTALAR CHAVE FUSIVEL INFERIOR 34,5KV","UN",0,"LINHA MORTA"],["BA_96","REALOCAR CHAVE FUSIVEL 34,5KV","UN",0,"LINHA MORTA"],["BA_97","RETIRAR CHAVE FUSIVEL 34,5KV","UN",0,"LINHA MORTA"],["BA_98","SUBST CHAVE FUSIVEL 34,5KV","UN",0,"LINHA MORTA"],["BA_99","INSTALAR CHAVE FUSIVEL MAIOR 34,5KV","UN",0,"LINHA MORTA"],["BA_141","CORTE DE VEGETACAO RURAL LV","UN",0,"LINHA VIVA"],["BA_142","CORTE DE VEGETACAO URBANA LV","UN",0,"LINHA VIVA"],["BA_143","INSTALAR CELULA CAPACITIVA LV","UN",0,"LINHA VIVA"],["BA_144","REALOCAR CELULA CAPACITIVA LV","UN",0,"LINHA VIVA"],["BA_145","RETIRAR CELULA CAPACITIVA LV","UN",0,"LINHA VIVA"],["BA_146","INSTALAR SUPORTE PARA BANCO CAPACITOR LV","UN",0,"LINHA VIVA"],["BA_147","REALOCAR SUPORTE PARA BANCO CAPACITOR LV","UN",0,"LINHA VIVA"],["BA_148","RETIRAR SUPORTE PARA BANCO CAPACITOR LV","UN",0,"LINHA VIVA"],["BA_149","INSTALAR TP PARA EQUIPAMENTO  LV","UN",0,"LINHA VIVA"],["BA_151","REALOCAR TP PARA EQUIPAMENTO  LV","UN",0,"LINHA VIVA"],["BA_152","RETIRAR TP PARA EQUIPAMENTO  LV","UN",0,"LINHA VIVA"],["BA_153","INSTALAR TC PARA EQUIPAMENTO  LV","UN",0,"LINHA VIVA"],["BA_154","REALOCAR TC PARA EQUIPAMENTO  LV","UN",0,"LINHA VIVA"],["BA_155","RETIRAR TC PARA EQUIPAMENTO  LV","UN",0,"LINHA VIVA"],["BA_156","INSTALAR CHAVE TRIPOLAR LV","UN",0,"LINHA VIVA"],["BA_157","REALOCAR CHAVE TRIPOLAR LV","UN",0,"LINHA VIVA"],["BA_158","RETIRAR CHAVE TRIPOLAR LV","UN",0,"LINHA VIVA"],["BA_160","INSTALAR CHAVE FUSIVEL RELIGADORA LV","UN",0,"LINHA VIVA"],["BA_161","REALOCAR CHAVE FUSIVEL RELIGADORA LV","UN",0,"LINHA VIVA"],["BA_162","RETIRAR CHAVE FUSIVEL RELIGADORA LV","UN",0,"LINHA VIVA"],["BA_163","INSTALAR CHAVE DE TRANSFERENCIA LV","UN",0,"LINHA VIVA"],["BA_164","REALOCAR CHAVE DE TRANSFERENCIA LV","UN",0,"LINHA VIVA"],["BA_165","RETIRAR CHAVE DE TRASFERENCIA LV","UN",0,"LINHA VIVA"],["BA_166","INSTALAR REGULADOR DE TENSAO LV","UN",0,"LINHA VIVA"],["BA_168","REALOCAR REGULADOR DE TENSAO LV","UN",0,"LINHA VIVA"],["BA_169","RETIRAR REGULADOR DE TENSAO LV","UN",0,"LINHA VIVA"],["BA_170","INSTALAR RELIGADOR LV","UN",0,"LINHA VIVA"],["BA_171","REALOCAR RELIGADOR LV","UN",0,"LINHA VIVA"],["BA_172","RETIRAR RELIGADOR LV","UN",0,"LINHA VIVA"],["BA_173","INSTALAR SECCIONALIZADOR TRIPOLAR LV","UN",0,"LINHA VIVA"],["BA_174","REALOCAR SECCIONALIZADOR TRIPOLAR LV","UN",0,"LINHA VIVA"],["BA_175","RETIRAR SECCIONALIZADOR TRIPOLAR LV","UN",0,"LINHA VIVA"],["BA_176","INSTALAR TRAFO MONOFASICO LV","UN",0,"LINHA VIVA"],["BA_177","REALOCAR TRAFO MONOFASICO LV","UN",0,"LINHA VIVA"],["BA_178","RETIRAR TRAFO MONOFASICO LV","UN",0,"LINHA VIVA"],["BA_179","INSTALAR TRAFO POLIFASICO LV PROVISORIO","UN",0,"LINHA VIVA"],["BA_180","INSTALAR TRAFO POLIFASICO LV","UN",0,"LINHA VIVA"],["BA_181","REALOCAR TRAFO POLIFASICO LV","UN",0,"LINHA VIVA"],["BA_182","RETIRAR TRAFO POLIFASICO LV PROVISORIO","UN",0,"LINHA VIVA"],["BA_183","RETIRAR TRAFO POLIFASICO LV","UN",0,"LINHA VIVA"],["BA_185","INSTALAR PARA-RAIOS < 34,5KV RD AEREA LV","UN",0,"LINHA VIVA"],["BA_186","INSTALAR PARA-RAIOS EM RD AEREA LV","UN",0,"LINHA VIVA"],["BA_187","REALOCAR PARA-RAIOS EM RD AEREA LV","UN",0,"LINHA VIVA"],["BA_188","RETIRAR PARA-RAIOS < 34,5KV EM RD AEREA","UN",0,"LINHA VIVA"],["BA_189","RETIRAR PARA-RAIOS EM RD AEREA LV","UN",0,"LINHA VIVA"],["BA_190","INSTALAR CONJ MEDICAO (TP/TC) LV","UN",0,"LINHA VIVA"],["BA_191","REALOCAR CONJ MEDICAO (TP/TC) LV","UN",0,"LINHA VIVA"],["BA_193","RETIRAR CONJ MEDICAO (TP/TC) LV","UN",0,"LINHA VIVA"],["BA_194","INSTALAR CABO COBERTO ATE 70 MM2 LV","M",0,"LINHA VIVA"],["BA_195","REALOCAR CABO COBERTO ATE 70 MM2 LV","M",0,"LINHA VIVA"],["BA_196","RETIRAR CABO COBERTO ATE 70 MM2 LV","M",0,"LINHA VIVA"],["BA_197","INSTALAR CABO COBERTO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_198","REALOCAR CABO COBERTO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_199","RETIRAR CABO COBERTO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_203","INSTALAR CONDUTOR NU LV","kg",0,"LINHA VIVA"],["BA_204","REALOCAR CONDUTOR NU LV","kg",0,"LINHA VIVA"],["BA_205","RETIRAR CONDUTOR NU LV","kg",0,"LINHA VIVA"],["BA_207","INSTALAR CABO PRE REUNIDO ATE 70 MM2 LV","M",0,"LINHA VIVA"],["BA_208","REALOCAR CABO PRE REUNIDO ATE 70 MM2 LV","M",0,"LINHA VIVA"],["BA_209","RETIRAR CABO PRE REUNIDO ATE 70 MM2 LV","M",0,"LINHA VIVA"],["BA_210","DESLOC CABO PRE REUNIDO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_211","INST CABO PRE REUNIDO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_212","REALOC CABO PRE REUNIDO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_213","RETIRAR CABO PRE REUNIDO ACIMA 70 MM2 LV - AT","M",0,"LINHA VIVA"],["BA_214","INSTALAR ESTAI AEREO LV","UN",0,"LINHA VIVA"],["BA_215","REALOCAR ESTAI AEREO LV","UN",0,"LINHA VIVA"],["BA_216","RETIRAR ESTAI AEREO LV","UN",0,"LINHA VIVA"],["BA_218","INSTALAR PINO COM ISOLADOR LV","UN",0,"LINHA VIVA"],["BA_219","REALOCAR PINO COM ISOLADOR LV","UN",0,"LINHA VIVA"],["BA_220","RETIRAR PINO COM ISOLADOR LV","UN",0,"LINHA VIVA"],["BA_222","INSTALAR ISOLADOR BASTAO/DISCO LV","UN",0,"LINHA VIVA"],["BA_223","REALOCAR ISOLADOR BASTAO/DISCO LV","UN",0,"LINHA VIVA"],["BA_224","RETIRAR ISOLADOR BASTAO/DISCO LV","UN",0,"LINHA VIVA"],["BA_225","INSTALAR EST CRUZ SIMP ISO PINO/PILAR LV","UN",0,"LINHA VIVA"],["BA_233","REALOCAR EST CRUZ DUPLA 1 ANCORAGEM LV","UN",0,"LINHA VIVA"],["BA_234","RETIRAR EST CRUZ DUPLA (1 ANCORAGEM) LV","UN",0,"LINHA VIVA"],["BA_235","INST EST CRUZ DUPLA 2 ANCORAGENS LV","UN",0,"LINHA VIVA"],["BA_236","REALOCAR EST CRUZ DUPLA 2 ANCORAGENS LV","UN",0,"LINHA VIVA"],["BA_237","RETIRAR EST CRUZ DUPLA 2 ANCORAGENS LV","UN",0,"LINHA VIVA"],["BA_238","INSTALAR EST CRUZ PARA EQUIPAMENTO LV","UN",0,"LINHA VIVA"],["BA_239","REALOCAR EST CRUZ PARA EQUIPAMENTO LV","UN",0,"LINHA VIVA"],["BA_240","RETIRAR EST CRUZ PARA EQUIPAMENTO LV","UN",0,"LINHA VIVA"],["BA_241","DESLOC EST CE1, CE1-E,CE1-A OU CE1A-E LV","UN",0,"LINHA VIVA"],["BA_242","INST EST CE1, CE1-E, CE1-A OU CE1A-E LV","UN",0,"LINHA VIVA"],["BA_243","REALOC EST CE1, CE1-E,CE1-A OU CE1A-E LV","UN",0,"LINHA VIVA"],["BA_244","RETIRAR EST CE1, CE1-E, CE1-A, CE1A-E LV","UN",0,"LINHA VIVA"],["BA_245","INSTALAR EST CE2, CE2-E, CE3, CE3-E LV","UN",0,"LINHA VIVA"],["BA_247","REALOCAR EST CE2, CE2-E, CE3, CE3-E LV","UN",0,"LINHA VIVA"],["BA_248","RETIRAR EST CE2, CE2-E, CE3, CE3-E LV","UN",0,"LINHA VIVA"],["BA_249","INSTALAR ESTRUTURA CE3-CE3 LV","UN",0,"LINHA VIVA"],["BA_250","REALOCAR ESTRUTURA CE3-CE3 LV","UN",0,"LINHA VIVA"],["BA_251","RETIRAR ESTRUTURA CE3-CE3 LV","UN",0,"LINHA VIVA"],["BA_252","INSTALAR ESTRUTURA CE1-3 OU CE1A-CE3 LV","UN",0,"LINHA VIVA"],["BA_253","REALOCAR ESTRUTURA CE1-3 OU CE1A-CE3 LV","UN",0,"LINHA VIVA"],["BA_254","RETIRAR ESTRUTURA CE1-3 OU CE1A-CE3 LV","UN",0,"LINHA VIVA"],["BA_256","INSTALAR ESTRUTURA CE4 OU CE4-E LV","UN",0,"LINHA VIVA"],["BA_257","REALOCAR ESTRUTURA CE4 OU CE4-E LV","UN",0,"LINHA VIVA"],["BA_258","RETIRAR ESTRUTURA CE4 OU CE4-E LV","UN",0,"LINHA VIVA"],["BA_259","INSTALAR EST CHAVE FACA RD COMPACTA LV","UN",0,"LINHA VIVA"],["BA_260","REALOCAR EST CHAVE FACA RD COMPACTA LV","UN",0,"LINHA VIVA"],["BA_261","RETIRAR EST CHAVE FACA EM RD COMPACTA LV","UN",0,"LINHA VIVA"],["BA_262","RETIRAR PINO COM ISOLADOR ESCADA LV","UN",0,"LINHA VIVA"],["BA_264","INSTALAR ISOLADOR BASTAO/DISCO ESCADA LV","UN",0,"LINHA VIVA"],["BA_265","REALOCAR ISOLADOR BASTAO/DISCO ESCADA LV","UN",0,"LINHA VIVA"],["BA_266","RETIRAR ISOLADOR BASTAO/DISCO ESCADA LV","UN",0,"LINHA VIVA"],["BA_267","INSTALAR CHAVE FUSIVEL 34,5KV LV","UN",0,"LINHA VIVA"],["BA_268","REALOCAR CHAVE FUSIVEL 34,5KV LV","UN",0,"LINHA VIVA"],["BA_269","RETIRAR CHAVE FUSIVEL INFERIOR 34,5KV LV","UN",0,"LINHA VIVA"],["BA_270","INSTALAR CHAVE FUSIVEL =34,5KV LV","UN",0,"LINHA VIVA"],["BA_271","REALOCAR CHAVE FUSIVEL =34,5KV LV","UN",0,"LINHA VIVA"],["BA_272","INSTALAR CHAVE FACA LV","UN",0,"LINHA VIVA"],["BA_276","REALOCAR EST CHAVE FUSIVEL 34,5KV LV","UN",0,"LINHA VIVA"],["BA_278","RETIRAR EST CHAVE FUSIVEL 34,5KV LV","UN",0,"LINHA VIVA"],["BA_279","INSTALAR EST CHAVE FUSIVEL =34,5KV LV","UN",0,"LINHA VIVA"],["BA_280","REALOCAR EST CHAVE FUSIVEL =34,5KV LV","UN",0,"LINHA VIVA"],["BA_281","RETIRAR EST CHAVE FUSIVEL =34,5KV LV","UN",0,"LINHA VIVA"],["BA_282","INSTALAR CONECTOR LV","UN",0,"LINHA VIVA"],["BA_283","INSTALAR JUMPER LINHA VIVA","UN",0,"LINHA VIVA"],["BA_284","RETIRAR JUMPER LINHA VIVA","UN",0,"LINHA VIVA"],["BA_286","RETIRAR GRAMPO TENSOR ANCORAGEM/SUSP LV","UN",0,"LINHA VIVA"],["BA_287","INSTALAR EST N3.CE3 OU B3.CE3 LINHA VIVA","UN",0,"LINHA VIVA"],["BA_288","REALOCAR EST N3.CE3 OU B3.CE3 LINHA VIVA","UN",0,"LINHA VIVA"],["BA_289","RETIRAR EST N3.CE3 OU B3.CE3 LINHA VIVA","UN",0,"LINHA VIVA"],["BA_290","INSTALAR ESTRUTURA PL1 LINHA VIVA","UN",0,"LINHA VIVA"],["BA_291","REALOCAR ESTRUTURA PL1 LINHA VIVA","UN",0,"LINHA VIVA"],["BA_292","RETIRAR ESTRUTURA PL1 LINHA VIVA","UN",0,"LINHA VIVA"],["BA_293","INSTALAR CABOS/FERRAGENS EM CH - LV","UN",0,"LINHA VIVA"],["BA_294","TENSIONAR E/OU FIXAR CONDUTOR LV","UN",0,"LINHA VIVA"],["BA_296","INSTALAR/RETIRAR COBERTURA PROVISORIA LV","UN",0,"LINHA VIVA"],["BA_297","BLOQUEIO EQUIPAMENTOS DE PROTECAO LV","UN",0,"LINHA VIVA"],["BA_320","RETIRAR EST CHAVE FUSIVEL 34,5KV","UN",0,"LINHA VIVA"],["BA_335","PODA RURAL LV","UN",0,"LINHA VIVA"],["BA_336","PODA URBANA LV","UN",0,"LINHA VIVA"],["BA_340","DESL CHAVE FUSIVEL RELIGADORA ESCADA LV","UN",0,"LINHA VIVA"],["BA_342","INST CHAVE FUSIVEL RELIGADORA ESCADA LV","UN",0,"LINHA VIVA"],["BA_343","REAL CHAVE FUSIVEL RELIGADORA ESCADA LV","UN",0,"LINHA VIVA"],["BA_344","RET CHAVE FUSIVEL RELIGADORA ESCADA LV","UN",0,"LINHA VIVA"],["BA_345","RETIRAR ESTAI SOLO LV","UN",0,"LINHA VIVA"],["BA_346","RETIRAR SECCIONAMENTO ESTAI LV","UN",0,"LINHA VIVA"],["BA_349","RETIRAR CHAVE FUSIVEL =34,5KV LV","UN",0,"LINHA VIVA"],["BA_350","RETIRAR CONECTOR LV","UN",0,"LINHA VIVA"],["BA_351","INST CONECTOR IMPACTO/ESTRIBO ESCADA LV","UN",0,"LINHA VIVA"],["BA_352","RETIRAR CONECTOR IMPACTO/ESTRIBO","UN",0,"LINHA VIVA"],["BA_353","RETIRAR ALCA PRE-FORMADA/G DE ANCOR LV","UN",0,"LINHA VIVA"],["BA_354","RETIRAR GLV EM RD LINHA VIVA","UN",0,"LINHA VIVA"],["BA_356","RETIRAR ALCA PRE-FORM/G ANCOR ESCADA LV","UN",0,"LINHA VIVA"],["BA_357","INSTALAR EMENDA DE CONDUTORES MT LV","UN",0,"LINHA VIVA"],["BA_359","RETIRAR EMENDA DE COND MT LINHA VIVA","UN",0,"LINHA VIVA"],["BA_360","REAPERTAR E REGULAR CHAVE FUSIVEL/FACA","UN",0,"LINHA VIVA"],["BA_361","RETENSIONAR ESTAI LV","UN",0,"LINHA VIVA"],["BA_363","INSTALAR GLV EM RD LV","UN",0,"LINHA VIVA"],["BA_364","ELIMINAR OBJETO ESTRANHO NA REDE","UN",0,"LINHA VIVA"],["BA_365","REGULAGEM EST REGULADOR","UN",0,"LINHA VIVA"],["BA_366","APRUMAR POSTE LV","UN",0,"LINHA VIVA"],["BA_367","INSTALAR ESPACADOR REDE COMPACTA LV","UN",0,"LINHA VIVA"],["BA_368","RETIRAR ESPACADOR REDE COMPACTA LV","UN",0,"LINHA VIVA"],["BA_369","INSTALAR AMORTECEDOR LV","UN",0,"LINHA VIVA"],["BA_370","RECUPERAR BASE ESTRUT MT DANIFIC EROSÃO","UN",0,"LINHA VIVA"],["BA_371","DESLOC PARA-RAIOS","UN",0,"LINHA VIVA"],["BA_372","INSTALAR PARA-RAIOS < 34,5KV ESCADA LV","UN",0,"LINHA VIVA"],["BA_373","REALOC PARA-RAIOS","UN",0,"LINHA VIVA"],["BA_374","RETIRAR PARA-RAIOS < 34,5KV ESCADA LV","UN",0,"LINHA VIVA"],["BA_375","RET CONECTOR IMPACTO/ESTRIBO ESCADA LV","UN",0,"LINHA VIVA"],["BA_376","REAPERT REGULAR CHAVE FUS/FACA ESCADA LV","UN",0,"LINHA VIVA"],["BA_378","INSTALAR ESPACADOR MT LV","UN",0,"LINHA VIVA"],["BA_140","ABERTURA DE FAIXA MEIO MANUAL","m2",0,"PODA"],["BA_330","LIMPEZA DE FAIXA MEIO MANUAL","m2",0,"PODA"],["BA_333","CORTE DE ARVORE DA+75","UN",0,"PODA"],["BA_334","CORTE BAMBU","m2",0,"PODA"],["BA_407","INSTALACAO INTERNA LPT","UN",2,"LC"],["BA_408","INSTALAR KIT CX MED 1F POLI POSTE/PAREDE","UN",0,"LC"],["BA_409","INSTALAR MEDIDOR MONOFASICO","UN",2,"LC"],["BA_410","INSTALAR MEDIDOR POLI-BT","UN",2,"LC"],["BA_411","INSTALAR MEDIDOR TRIFASICO","UN",2,"LC"],["BA_412","INSTALAR RAMAL DE LIG POLI-BT","UN",2,"LC"],["BA_413","INSTALAR RAMAL DE LIG-MONO-BT","UN",2,"LC"],["BA_414","APOIO EM DESLIGAMENTO","UN",1,"LINHA MORTA"],["BA_415","DESLIGAMENTO","UND",1,"LINHA MORTA"],["BA_500","ATIVIDADE NÃO REALIZADA","UND",0,"LINHA MORTA"]];

  var USUARIOS = {
    'joao.araujo@mariua.com.br':      { id: 'teste-gestor',     nome: 'João Araújo', gestor: true },
    'maria.escritorio@mariua.com.br': { id: 'teste-escritorio', nome: 'Maria Souza' },
    'alan@mariua.com.br':             { id: 'teste-alan',       nome: 'Alan Conceição Santos', matricula: '1001' },
    'bruno@mariua.com.br':            { id: 'teste-bruno',      nome: 'Bruno Matos', matricula: '1002' }
  };
  var EQUIPES = [
    { codigo: 'ALAN-IRC',   encarregado: 'Alan Conceição Santos', matricula: '1001', centro: 'IRECÊ',            qtd_colab: '5' },
    { codigo: 'BRUNO-JAC',  encarregado: 'Bruno Matos',           matricula: '1002', centro: 'JACOBINA',         qtd_colab: '5' },
    { codigo: 'CARLOS-FSA', encarregado: 'Carlos Andrade',        matricula: '1003', centro: 'FEIRA DE SANTANA', qtd_colab: '4' },
    { codigo: 'DIEGO-IRC',  encarregado: 'Diego Reis',            matricula: '1004', centro: 'IRECÊ',            qtd_colab: '5' },
    { codigo: 'EDSON-JAC',  encarregado: 'Edson Lima',            matricula: '1005', centro: 'JACOBINA',         qtd_colab: '4' },
    { codigo: 'FABIO-SRR',  encarregado: 'Fábio Nunes',           matricula: '1006', centro: 'SERRINHA',         qtd_colab: '4' },
    { codigo: 'GILSON-IRC', encarregado: 'Gilson Prado',          matricula: '1007', centro: 'IRECÊ',            qtd_colab: '5' },
    { codigo: 'HUGO-FSA',   encarregado: 'Hugo Melo',             matricula: '1008', centro: 'FEIRA DE SANTANA', qtd_colab: '4' },
    { codigo: 'IVAN-JAC',   encarregado: 'Ivan Rocha',            matricula: '1009', centro: 'JACOBINA',         qtd_colab: '4' },
    { codigo: 'JAIR-IRC',   encarregado: 'Jair Souza',            matricula: '1010', centro: 'IRECÊ',            qtd_colab: '4' }
  ];
  var EFETIVO = {
    'ALAN-IRC':  [['2001', 'Bruno Lima', 'ELETRICISTA'], ['2002', 'Carlos Souza', 'AUXILIAR'], ['2003', 'Diego Ramos', 'ELETRICISTA'], ['2004', 'Everton Silva', 'MOTORISTA']],
    'BRUNO-JAC': [['2101', 'Fernando Alves', 'ELETRICISTA'], ['2102', 'Gabriel Costa', 'AUXILIAR'], ['2103', 'Henrique Dias', 'MOTORISTA']]
  };
  var FUNCIONARIOS_EXTRA = [['3001', 'ANA PAULA FERREIRA', 'ATIVO'], ['3002', 'RAFAEL MOREIRA', 'ATIVO'], ['3003', 'SERGIO TAVARES', 'AFASTADO'], ['3004', 'LUCAS PEREIRA', 'ATIVO']];
  var OBRAS = [
    ['PEP-2026-0412', 'Extensão de rede Lagoa Grande', 'Irecê'], ['PEP-2026-0388', 'Melhoria BT Centro', 'Irecê'],
    ['PEP-2026-0501', 'Reforço rede rural Várzea', 'Jacobina'], ['PEP-2026-0455', 'Ligação nova Loteamento Sol', 'Feira de Santana'],
    ['OS 88123', 'Poda e manutenção Rua A', 'Serrinha']
  ];

  // ─── utilidades ─────────────────────────────────────────────────────────
  function p2(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dia(n) { var d = new Date(); d.setDate(d.getDate() - n); return iso(d); }
  function quando(n, h, m) {
    var d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m || 0, 0, 0);
    if (d.getTime() > Date.now()) d = new Date(Date.now() - ((h * 7 + (m || 0)) % 170 + 8) * 60000);   // hoje: nunca no futuro
    return d.toISOString();
  }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function casa(a, b) { return !!a && !!b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0); }
  function sorteio(semente) {
    return function () {
      semente |= 0; semente = semente + 0x6D2B79F5 | 0;
      var t = Math.imul(semente ^ semente >>> 15, 1 | semente);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function uuidTeste(k) { return 'aaaaaaaa-0000-4000-8000-' + String(100000000000 + k).slice(-12); }

  // ─── dados de exemplo ───────────────────────────────────────────────────
  function semente() {
    var r = sorteio(20261116), porCod = {};
    CATALOGO.forEach(function (x) { porCod[x[0]] = x; });
    var usados = ['BA_01', 'BA_02', 'BA_24', 'BA_58', 'BA_131', 'BA_337', 'BA_11', 'BA_228'];
    var rdos = [], k = 0;
    for (var n = 6; n >= 0; n--) {
      // hoje: Bruno, Carlos e Diego já mandaram; Alan (o encarregado do app de teste) ainda não
      var equipes = n === 0 ? EQUIPES.slice(1, 4) : EQUIPES.slice(0, 8).sort(function () { return r() - 0.5; }).slice(0, 5 + Math.floor(r() * 3));
      equipes.forEach(function (eq) {
        k++;
        var servicos = usados.slice().sort(function () { return r() - 0.5; }).slice(0, 1 + Math.floor(r() * 3)).map(function (c) {
          var x = porCod[c] || [c, c, 'UN', 0, 'LINHA MORTA'];
          return { codigo: x[0], descricao: x[1], qtd: x[3] > 0 ? Math.round((40 + r() * 280) * 10) / 10 : 1 + Math.floor(r() * 8),
                   unidade: x[2], grupo: x[4], contrato: CONTRATO, fora_da_lista: false };
        });
        if (k === 5 || k === 17) servicos.push({ codigo: null, descricao: 'Limpeza manual de faixa', qtd: 12.5, unidade: 'm2', grupo: null, contrato: null, fora_da_lista: true });
        var nf = 2 + Math.floor(r() * 3), fotos = [];
        for (var i = 0; i < nf; i++) {
          fotos.push({ path: 'exemplos/foto-' + (1 + (i + k) % 3) + '.jpg', etapa: ['antes', 'durante', 'depois'][i % 3], legenda: i === 0 ? 'Início do serviço' : '',
                       lat: -11.30 - r() / 50, lng: -41.85 - r() / 50, precisao: 6 + Math.floor(r() * 10), tirada_em: quando(n, 8 + i * 2, 10), origem: 'camera' });
        }
        if (k === 9 || k === 21) { fotos[0].origem = 'galeria'; fotos[0].lat = null; fotos[0].lng = null; }
        var ob = OBRAS[Math.floor(r() * OBRAS.length)];
        var ef = EFETIVO[eq.codigo] || [];
        rdos.push({
          id: uuidTeste(k), data: dia(n), equipe_codigo: eq.codigo, encarregado: eq.encarregado,
          autor_id: 'teste-' + eq.codigo.split('-')[0].toLowerCase(), autor_email: eq.codigo.split('-')[0].toLowerCase() + '@mariua.com.br',
          pep: ob[0], nome_obra: ob[1], municipio: ob[2], atividade: 'Implantação de poste', prog_id: null,
          hora_inicio: '07:' + p2(Math.floor(r() * 40)) + ':00', hora_fim: '16:' + p2(10 + Math.floor(r() * 49)) + ':00',
          clima_manha: 'bom', clima_tarde: ['bom', 'nublado', 'chuva'][Math.floor(r() * 3)],
          efetivo: ef.length || 3 + Math.floor(r() * 3), efetivo_nomes: ef.map(function (f) { return { matricula: f[0], nome: f[1], funcao: f[2] }; }),
          servicos: servicos, paralisacao: (k === 3 || k === 12 || k === 26) ? { motivo: 'Chuva', horas: 1.5, descricao: 'Chuva forte à tarde' } : null,
          observacoes: k === 4 ? 'Faltou 1 poste de 11 m no almoxarifado.' : null, fotos: fotos,
          lat: -11.3, lng: -41.85, precisao_m: 8, finalizado_em: quando(n, 17, 5), recebido_em: quando(n, 17, 6 + Math.floor(r() * 40)), versao_app: '1.2.3'
        });
      });
    }
    var celular = function (eq, versao, plat, inst, fila, erro, nDesde, contato) {
      return { id: 'teste-' + eq.codigo, autor_id: 'teste-' + eq.codigo, usuario: eq.codigo.split('-')[0].toLowerCase() + '@mariua.com.br',
               equipe_codigo: eq.codigo, encarregado: eq.encarregado, versao_app: versao, plataforma: plat, instalado: inst,
               fila: fila, com_erro: erro, fila_desde: nDesde, catalogo_em: quando(1, 7), ultimo_contato: contato, primeiro_contato: quando(20, 8) };
    };
    var aparelhos = [
      celular(EQUIPES[1], '1.2.3', 'Android 13 (APK)', true, 0, 0, null, quando(0, 16, 50)),
      celular(EQUIPES[2], '1.2.3', 'Android 12', true, 2, 0, quando(2, 17, 10), quando(2, 17, 12)),
      celular(EQUIPES[3], '1.2.3', 'iPhone', true, 1, 1, quando(0, 16, 40), quando(0, 16, 45)),
      celular(EQUIPES[4], '1.1.2', 'Android 11', false, 0, 0, null, quando(1, 18)),
      celular(EQUIPES[6], '1.2.3', 'Android 14 (APK)', true, 0, 0, null, quando(1, 17, 40))
    ];
    var hoje = dia(0);
    var prog = [
      { id: 'p1', data: hoje, encarregado: 'ALAN CONCEICAO SANTOS', pep: 'PEP-2026-0412', nome_obra: 'Extensão de rede Lagoa Grande', municipio: 'Irecê', atividade: 'Implantação de poste', qtd_previsto: 6 },
      { id: 'p2', data: hoje, encarregado: 'ALAN CONCEICAO SANTOS', pep: 'PEP-2026-0388', nome_obra: 'Melhoria BT Centro', municipio: 'Irecê', atividade: 'Lançamento de cabo', qtd_previsto: 320 },
      { id: 'p3', data: hoje, encarregado: 'BRUNO MATOS', pep: 'PEP-2026-0501', nome_obra: 'Reforço rede rural Várzea', municipio: 'Jacobina', atividade: 'Instalação de cruzeta', qtd_previsto: 4 },
      { id: 'p4', data: hoje, encarregado: 'CARLOS ANDRADE', pep: 'PEP-2026-0455', nome_obra: 'Ligação nova Loteamento Sol', municipio: 'Feira de Santana', atividade: 'Ligação de cliente', qtd_previsto: 8 },
      { id: 'p5', data: hoje, encarregado: 'DIEGO REIS', pep: 'PEP-2026-0412', nome_obra: 'Extensão de rede Lagoa Grande', municipio: 'Irecê', atividade: 'Implantação de poste', qtd_previsto: 5 },
      { id: 'p6', data: hoje, encarregado: 'EDSON LIMA', pep: 'PEP-2026-0501', nome_obra: 'Reforço rede rural Várzea', municipio: 'Jacobina', atividade: 'Lançamento de cabo', qtd_previsto: 200 },
      { id: 'p7', data: hoje, encarregado: 'EDSON LIMA', pep: 'PEP-2026-0388', nome_obra: 'Melhoria BT Centro', municipio: 'Irecê', atividade: 'Instalação de cruzeta', qtd_previsto: 3 },
      { id: 'p8', data: hoje, encarregado: 'FABIO NUNES', pep: 'OS 88123', nome_obra: 'Poda e manutenção Rua A', municipio: 'Serrinha', atividade: 'Poda urbana', qtd_previsto: 10 },
      { id: 'p9', data: hoje, encarregado: 'ZECA SEM CADASTRO', pep: 'PEP-2026-0455', nome_obra: 'Ligação nova Loteamento Sol', municipio: 'Feira de Santana', atividade: 'Ligação de cliente', qtd_previsto: 4 }
    ];
    // programação feita direto no Sistema RDO (a de cima faz o papel da Programação Diária do sistema Mariuá)
    var amanha = dia(-1), feitoEm = quando(1, 16, 20), porQuem = 'maria.escritorio@mariua.com.br';
    var programacao = [
      [hoje, EQUIPES[6], 'PEP-2026-0388', 'Melhoria BT Centro', 'Irecê', 'Instalação de cruzeta', 2],
      [amanha, EQUIPES[0], 'PEP-2026-0412', 'Extensão de rede Lagoa Grande', 'Irecê', 'Implantação de poste', 6],
      [amanha, EQUIPES[1], 'PEP-2026-0501', 'Reforço rede rural Várzea', 'Jacobina', 'Lançamento de cabo', 280],
      [amanha, EQUIPES[2], 'PEP-2026-0455', 'Ligação nova Loteamento Sol', 'Feira de Santana', 'Ligação de cliente', 10]
    ].map(function (x, i) {
      return { id: uuidTeste(900 + i), data: x[0], equipe_codigo: x[1].codigo, encarregado: x[1].encarregado, pep: x[2], nome_obra: x[3],
               municipio: x[4], atividade: x[5], qtd_previsto: x[6], criado_em: feitoEm, criado_por: porQuem, atualizado_em: feitoEm, atualizado_por: porQuem };
    });
    var catalogo = CATALOGO.map(function (x) {
      return { contrato: CONTRATO, codigo: x[0], descricao: x[1], unidade: x[2], casas_decimais: x[3], grupo: x[4], ativo: true,
               atualizado_em: quando(0, 9, 30), atualizado_por: 'joao.araujo@mariua.com.br' };
    });
    var contas = [
      { email: 'joao.araujo@mariua.com.br', nome: 'João Araújo', matricula: '0901', gestor: true, ativo: true, criado_em: quando(200, 9) },
      { email: 'maria.escritorio@mariua.com.br', nome: 'Maria Souza', matricula: '0902', gestor: false, ativo: true, criado_em: quando(150, 9) }
    ].concat(EQUIPES.map(function (q, i) {
      return { email: norm(q.encarregado.split(' ')[0]).toLowerCase() + '@mariua.com.br', nome: q.encarregado, matricula: q.matricula, func_nome: norm(q.encarregado),
               gestor: false, ativo: true, criado_em: quando(90 - i * 5, 10) };
    })).concat([{ email: 'kleber@mariua.com.br', nome: 'Kléber Dias', matricula: '1011', gestor: false, ativo: false, criado_em: quando(120, 10) }]);
    return {
      contas: contas,
      rdo_campo: rdos, rdo_campo_aparelhos: aparelhos, prog: prog, rdo_programacao: programacao, servicos_catalogo: catalogo,
      rdo_campo_config: [{ id: 1, atualizado_em: quando(2, 10), atualizado_por: 'joao.araujo@mariua.com.br', dados: {
        aviso: 'Este é o modo de teste. Os RDOs ficam só neste navegador.', aviso_ativo: true, fotos_minimas: 1, exigir_termino: false, versao_minima: '',
        motivos: ['Chuva', 'Falta de material', 'Desligamento não liberado', 'Interferência de terceiros', 'Veículo ou equipamento', 'Acidente ou incidente', 'Outro'] } }],
      rdo_campo_acesso: [{ email: 'maria.escritorio@mariua.com.br', ativo: true, incluido_em: quando(3, 9), incluido_por: 'joao.araujo@mariua.com.br' }]
    };
  }

  // ─── banco do navegador (IndexedDB) ─────────────────────────────────────
  var banco = (function () {
    var aberto = null;
    function abrir() {
      if (!aberto) aberto = new Promise(function (ok, falha) {
        var r = indexedDB.open(NOME_DB, 1);
        r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('tabelas'); d.createObjectStore('arquivos'); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { falha(r.error); };
      });
      return aberto;
    }
    function pedido(loja, modo, fazer) {
      return abrir().then(function (d) {
        return new Promise(function (ok, falha) {
          var t = d.transaction(loja, modo), q = fazer(t.objectStore(loja));
          t.oncomplete = function () { ok(q ? q.result : undefined); };
          t.onerror = function () { falha(t.error); };
        });
      });
    }
    return {
      ler: function (n) { return pedido('tabelas', 'readonly', function (s) { return s.get(n); }); },
      gravar: function (n, v) { return pedido('tabelas', 'readwrite', function (s) { return s.put(v, n); }); },
      lerArquivo: function (p) { return pedido('arquivos', 'readonly', function (s) { return s.get(p); }); },
      gravarArquivo: function (p, b) { return pedido('arquivos', 'readwrite', function (s) { return s.put(b, p); }); },
      fechar: function () { if (aberto) aberto.then(function (d) { d.close(); }); }
    };
  })();

  // Semeia uma vez por dia: no dia seguinte o teste recomeça com datas novas.
  var pronto = (async function () {
    var marca = await banco.ler('_semente');
    if (!marca || marca.dia !== dia(0) || !marca.contas || marca.v !== 2) {
      var s = semente();
      for (var k in s) await banco.gravar(k, s[k]);
      await banco.gravar('_semente', { dia: dia(0), em: Date.now(), contas: true, v: 2 });
    }
  })();
  async function tabela(n) { await pronto; return (await banco.ler(n)) || []; }

  var canal = window.BroadcastChannel ? new BroadcastChannel('rdo-teste') : null;
  async function salvar(n, linhas) {
    await banco.gravar(n, linhas);
    if (canal) canal.postMessage({ tabela: n });
  }

  // ─── sessão de teste (sem login) ────────────────────────────────────────
  var CHAVE = 'rdo-teste-sessao-' + TIPO;
  var CHAVE_CONTA = 'rdo-teste-conta-' + TIPO;
  function contaInfo(e) {
    if (USUARIOS[e]) return USUARIOS[e];
    try { var j = JSON.parse(localStorage.getItem(CHAVE_CONTA) || 'null'); if (j && j.email === e) return j; } catch (x) {}
    return null;
  }
  var PADRAO = TIPO === 'campo' ? 'alan@mariua.com.br' : 'joao.araujo@mariua.com.br';
  function usuarioAtual() {
    var v = null;
    try { v = localStorage.getItem(CHAVE); } catch (e) {}
    if (v === null) return PADRAO;
    return v && contaInfo(v) ? v : null;           // '' = saiu
  }
  function sessao() {
    var e = usuarioAtual(); if (!e) return null;
    var u = contaInfo(e);
    return { access_token: 'teste', refresh_token: 'teste', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
             user: { id: u.id, email: e, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { nome: u.nome, matricula: u.matricula || '' } } };
  }
  var ouvintes = [];
  function avisar(ev, s) { ouvintes.slice().forEach(function (f) { try { f(ev, s); } catch (e) {} }); }
  var auth = {
    getSession: async function () { await pronto; return { data: { session: sessao() }, error: null }; },
    getUser: async function () { var s = sessao(); return { data: { user: s ? s.user : null }, error: null }; },
    onAuthStateChange: function (cb) {
      ouvintes.push(cb);
      return { data: { subscription: { unsubscribe: function () { ouvintes = ouvintes.filter(function (f) { return f !== cb; }); } } } };
    },
    signInWithPassword: async function (c) {
      var e = String((c && c.email) || '').toLowerCase();
      var conta = (await tabela('contas')).filter(function (x) { return x.email === e; })[0];
      var invalido = { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
      if (!conta) return invalido;
      if (conta.ativo === false) return { data: { user: null, session: null }, error: { message: 'User is banned', status: 400 } };
      if (conta.senha && conta.senha !== String(c.password || '')) return invalido;      // contas criadas no teste têm senha
      try {
        localStorage.setItem(CHAVE, e);
        localStorage.setItem(CHAVE_CONTA, JSON.stringify({ email: e, id: (USUARIOS[e] || {}).id || 'teste-' + e.split('@')[0], nome: conta.nome || e.split('@')[0], matricula: conta.matricula || '', gestor: !!conta.gestor }));
      } catch (x) {}
      var s = sessao(); avisar('SIGNED_IN', s);
      return { data: { user: s.user, session: s }, error: null };
    },
    signOut: async function () { try { localStorage.setItem(CHAVE, ''); } catch (x) {} avisar('SIGNED_OUT', null); return { error: null }; },
    resetPasswordForEmail: async function () { return { data: {}, error: null }; },
    updateUser: async function () { var s = sessao(); return { data: { user: s && s.user }, error: null }; }
  };

  // ─── consultas às tabelas ───────────────────────────────────────────────
  function Consulta(t) { this.t = t; this.op = 'select'; this.fs = []; this.os = []; this.ini = null; this.fim = null; this.lim = null; this.um = false; this.conta = false; this.linhas = null; }
  Consulta.prototype.select = function (c, o) { if (o && o.count) this.conta = true; return this; };
  Consulta.prototype.eq = function (c, v) { this.fs.push(function (r) { return String(r[c]) === String(v); }); return this; };
  Consulta.prototype.gte = function (c, v) { this.fs.push(function (r) { return r[c] != null && String(r[c]) >= String(v); }); return this; };
  Consulta.prototype.lte = function (c, v) { this.fs.push(function (r) { return r[c] != null && String(r[c]) <= String(v); }); return this; };
  Consulta.prototype.order = function (c, o) { this.os.push({ c: c, asc: !(o && o.ascending === false) }); return this; };
  Consulta.prototype.range = function (a, b) { this.ini = a; this.fim = b; return this; };
  Consulta.prototype.limit = function (n) { this.lim = n; return this; };
  Consulta.prototype.maybeSingle = function () { this.um = true; return this; };
  Consulta.prototype.single = Consulta.prototype.maybeSingle;
  Consulta.prototype.upsert = function (d) { this.op = 'upsert'; this.linhas = [].concat(d); return this; };
  Consulta.prototype.insert = function (d) { this.op = 'upsert'; this.linhas = [].concat(d); return this; };
  Consulta.prototype.then = function (ok, falha) { return executar(this).then(ok, falha); };
  Consulta.prototype.catch = function (f) { return executar(this).catch(f); };

  async function executar(q) {
    var linhas = await tabela(q.t);
    if (q.op === 'select') {
      var r = linhas.filter(function (x) { return q.fs.every(function (f) { return f(x); }); });
      for (var i = q.os.length - 1; i >= 0; i--) {
        (function (o) {
          r.sort(function (a, b) {
            var x = a[o.c] == null ? '' : String(a[o.c]), y = b[o.c] == null ? '' : String(b[o.c]);
            return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
          });
        })(q.os[i]);
      }
      var total = r.length;
      if (q.ini != null) r = r.slice(q.ini, q.fim + 1);
      if (q.lim != null) r = r.slice(0, q.lim);
      r = JSON.parse(JSON.stringify(r));
      return { data: q.um ? (r[0] || null) : r, error: null, count: q.conta ? total : null, status: 200 };
    }
    var agora = new Date().toISOString();
    q.linhas.forEach(function (n) {
      var achou = -1;
      linhas.forEach(function (x, k) { if (x.id === n.id) achou = k; });
      var linha = Object.assign({}, achou >= 0 ? linhas[achou] : {}, n);
      if (q.t === 'rdo_campo' && !linha.recebido_em) linha.recebido_em = agora;
      if (q.t === 'rdo_campo_aparelhos' && !linha.primeiro_contato) linha.primeiro_contato = agora;
      if (achou >= 0) linhas[achou] = linha; else linhas.push(linha);
    });
    await salvar(q.t, linhas);
    return { data: null, error: null, status: 201 };
  }

  // ─── funções do banco (rpc) ─────────────────────────────────────────────
  async function emailDe(usuario) {
    var u = String(usuario || '').trim().toLowerCase(), contas = await tabela('contas');
    var c = contas.filter(function (x) { return u.indexOf('@') > 0 ? x.email === u : (x.email.split('@')[0] === u || String(x.matricula || '') === u); })[0];
    return c ? c.email : null;
  }
  async function papel() {
    var e = usuarioAtual(); if (!e) return null;
    var conta = (await tabela('contas')).filter(function (x) { return x.email === e; })[0];
    if (conta && conta.gestor) return 'gestor';
    var ac = await tabela('rdo_campo_acesso');
    return ac.some(function (x) { return x.email === e && x.ativo; }) ? 'escritorio' : null;
  }
  function todosFuncionarios() {
    var lista = EQUIPES.map(function (q) { return [q.matricula, norm(q.encarregado), 'ATIVO']; });
    Object.keys(EFETIVO).forEach(function (k) { EFETIVO[k].forEach(function (f) { lista.push([f[0], norm(f[1]), 'ATIVO']); }); });
    return lista.concat(FUNCIONARIOS_EXTRA);
  }
  async function soGestor(msg) { if ((await papel()) !== 'gestor') throw new Error(msg); }

  var RPC = {
    rdo_campo_email_login: async function (p) { return await emailDe(p.p_usuario); },
    rdo_campo_meu_acesso: papel,
    rdo_campo_acessos: async function () {
      await soGestor('Só gestores veem quem tem acesso à gestão.');
      return (await tabela('rdo_campo_acesso')).filter(function (x) { return x.ativo; });
    },
    rdo_campo_definir_acesso: async function (p) {
      await soGestor('Só gestores liberam acesso à gestão.');
      var e = await emailDe(p.p_usuario);
      if (!e) throw new Error('Não achamos uma conta com esse usuário. Crie a conta na aba Usuários.');
      var ac = (await tabela('rdo_campo_acesso')).filter(function (x) { return x.email !== e; });
      ac.push({ email: e, ativo: !!p.p_ativo, incluido_em: new Date().toISOString(), incluido_por: usuarioAtual() });
      await salvar('rdo_campo_acesso', ac);
      return { email: e, ativo: !!p.p_ativo };
    },
    admin_listar_usuarios: async function () {
      await soGestor('Sem acesso à lista de usuários.');
      return (await tabela('contas')).map(function (c) {
        return { email: c.email, nome: c.nome || null, matricula: c.matricula || null, func_nome: c.func_nome || null, telefone: c.telefone || null,
                 data_vigencia: c.data_vigencia || null, gestor: !!c.gestor, ativo: c.ativo !== false, criado_em: c.criado_em };
      });
    },
    admin_criar_usuario: async function (p) {
      await soGestor('Só gestores criam usuários.');
      var e = String(p.p_email || '').trim().toLowerCase(), contas = await tabela('contas');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido.');
      if (contas.some(function (c) { return c.email === e; })) throw new Error('User already registered');
      if (String(p.p_senha || '').length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.');
      var func = todosFuncionarios().filter(function (f) { return f[0] === String(p.p_matricula || ''); })[0];
      contas.push({ email: e, nome: p.p_nome || null, matricula: p.p_matricula || null, func_nome: func ? func[1] : null, telefone: p.p_telefone || null,
                    data_vigencia: p.p_vigencia || null, gestor: !!p.p_gestor, ativo: true, criado_em: new Date().toISOString(), senha: String(p.p_senha) });
      await salvar('contas', contas);
      return { email: e };
    },
    admin_atualizar_usuario: async function (p) {
      await soGestor('Só gestores mudam usuários.');
      var contas = await tabela('contas'), c = contas.filter(function (x) { return x.email === String(p.p_email || '').toLowerCase(); })[0];
      if (!c) throw new Error('Conta não encontrada.');
      c.nome = p.p_nome || null; c.matricula = p.p_matricula || null; c.telefone = p.p_telefone || null; c.data_vigencia = p.p_vigencia || null;
      var func = todosFuncionarios().filter(function (f) { return f[0] === String(c.matricula || ''); })[0];
      c.func_nome = func ? func[1] : null;
      await salvar('contas', contas);
      return true;
    },
    admin_set_ativo: async function (p) {
      await soGestor('Só gestores ativam ou desativam usuários.');
      var contas = await tabela('contas'), c = contas.filter(function (x) { return x.email === String(p.p_email || '').toLowerCase(); })[0];
      if (!c) throw new Error('Conta não encontrada.');
      c.ativo = !!p.p_ativo;
      await salvar('contas', contas);
      return true;
    },
    admin_set_telas: async function () { return true; },
    admin_buscar_funcionarios: async function (p) {
      var t = norm(p.p_termo);
      return todosFuncionarios().filter(function (f) { return f[0].indexOf(t) === 0 || norm(f[1]).indexOf(t) >= 0; })
        .slice(0, 20).map(function (f) { return { matricula: f[0], nome: f[1], situacao: f[2] }; });
    },
    rdo_campo_definir_senha: async function (p) {
      await soGestor('Só gestores trocam a senha de outra pessoa.');
      if (String(p.p_senha || '').length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.');
      var contas = await tabela('contas'), c = contas.filter(function (x) { return x.email === String(p.p_email || '').trim().toLowerCase(); })[0];
      if (!c) throw new Error('Não achamos a conta ' + p.p_email + '.');
      c.senha = String(p.p_senha);
      await salvar('contas', contas);
      return null;
    },
    rdo_campo_equipes: async function () { return EQUIPES.map(function (q) { return Object.assign({ utd: '', supervisor: '', tipo: '', veiculo: '' }, q); }); },
    rdo_campo_contexto: async function (p) {
      var alvo = norm(p.p_encarregado);
      var cods = EQUIPES.filter(function (q) { return casa(norm(q.encarregado), alvo); }).map(function (q) { return norm(q.codigo); });
      var mariua = (await tabela('prog')).filter(function (x) { return x.data === p.p_data && casa(norm(x.encarregado), alvo); });
      var proprio = (await tabela('rdo_programacao')).filter(function (x) {
        return x.data === p.p_data && (cods.indexOf(norm(x.equipe_codigo)) >= 0 || casa(norm(x.encarregado), alvo));
      }).sort(function (a, b) { return String(a.criado_em).localeCompare(String(b.criado_em)); });
      var eq = EQUIPES.filter(function (q) { return casa(norm(q.encarregado), alvo); })[0];
      return {
        programacao: mariua.map(function (x) { return { id: x.id, pep: x.pep, nome_obra: x.nome_obra, municipio: x.municipio, atividade: x.atividade, atividade_cod: '', tipo: '', turno: '', qtd_previsto: x.qtd_previsto, origem: 'mariua' }; })
          .concat(proprio.map(function (x) { return { id: x.id, pep: x.pep || '', nome_obra: x.nome_obra || '', municipio: x.municipio || '', atividade: x.atividade || '', atividade_cod: '', tipo: '', turno: '', qtd_previsto: x.qtd_previsto, origem: 'rdo' }; })),
        efetivo: (eq && EFETIVO[eq.codigo] ? EFETIVO[eq.codigo] : []).map(function (f) { return { matricula: f[0], nome: f[1], funcao: f[2] }; })
      };
    },
    rdo_campo_programados: async function (p) {
      var grupos = {};
      var juntar = function (codigo, encarregado, obras) {
        var k = codigo ? 'C:' + norm(codigo) : 'E:' + norm(encarregado);
        var g = grupos[k] || (grupos[k] = { encarregado: encarregado, codigo: codigo || null, obras: 0 });
        g.obras += obras;
      };
      var porEnc = {};
      (await tabela('prog')).filter(function (x) { return x.data === p.p_data; }).forEach(function (x) {
        var n = norm(x.encarregado); (porEnc[n] = porEnc[n] || { encarregado: x.encarregado, obras: 0 }).obras++;
      });
      Object.keys(porEnc).forEach(function (n) {
        var eq = EQUIPES.filter(function (q) { return casa(norm(q.encarregado), n); })[0];
        juntar(eq ? eq.codigo : null, eq ? eq.encarregado : porEnc[n].encarregado, porEnc[n].obras);
      });
      (await tabela('rdo_programacao')).filter(function (x) { return x.data === p.p_data; }).forEach(function (x) {
        var eq = EQUIPES.filter(function (q) { return norm(q.codigo) === norm(x.equipe_codigo); })[0];
        juntar(x.equipe_codigo, eq ? eq.encarregado : x.encarregado, 1);
      });
      return Object.keys(grupos).map(function (k) { return grupos[k]; });
    },
    rdo_programacao_dia: async function (p) {
      if (!(await papel())) throw new Error('Só quem tem acesso à gestão vê a programação.');
      var mariua = (await tabela('prog')).filter(function (x) { return x.data === p.p_data; }).map(function (x) {
        var eq = EQUIPES.filter(function (q) { return casa(norm(q.encarregado), norm(x.encarregado)); })[0];
        return { id: x.id, origem: 'mariua', data: x.data, equipe_codigo: eq ? eq.codigo : '', encarregado: x.encarregado, pep: x.pep, nome_obra: x.nome_obra,
                 municipio: x.municipio, atividade: x.atividade, turno: '', qtd_previsto: x.qtd_previsto };
      });
      var proprio = (await tabela('rdo_programacao')).filter(function (x) { return x.data === p.p_data; })
        .sort(function (a, b) { return String(a.criado_em).localeCompare(String(b.criado_em)); })
        .map(function (x) { return Object.assign({ origem: 'rdo' }, x); });
      return mariua.concat(proprio);
    },
    rdo_programacao_salvar: async function (p) {
      if (!(await papel())) throw new Error('Só quem tem acesso à gestão programa obras.');
      var it = p.p_item || {}, tx = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n) || null; };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(it.data || ''))) throw new Error('Escolha o dia da programação.');
      if (!String(it.equipe_codigo || '').trim()) throw new Error('Escolha a equipe.');
      var eq = EQUIPES.filter(function (q) { return norm(q.codigo) === norm(it.equipe_codigo); })[0];
      if (!eq) throw new Error('A equipe ' + String(it.equipe_codigo).trim() + ' não está no Cadastro de Equipes. O app só mostra a programação de equipes do cadastro.');
      if (!tx(it.pep, 60) && !tx(it.nome_obra, 160)) throw new Error('Escreva o PEP ou o nome da obra.');
      var q = String(it.qtd_previsto == null ? '' : it.qtd_previsto).trim().replace(',', '.'), qtd = null;
      if (q) { if (!/^\d+(\.\d+)?$/.test(q)) throw new Error('Quantidade prevista inválida. Use só números, como 6 ou 320,5.'); qtd = +q; }
      var linhas = await tabela('rdo_programacao'), agora = new Date().toISOString(), quem = usuarioAtual(), linha;
      var dados = { data: it.data, equipe_codigo: eq.codigo, encarregado: eq.encarregado, pep: tx(it.pep, 60), nome_obra: tx(it.nome_obra, 160),
                    municipio: tx(it.municipio, 80), atividade: tx(it.atividade, 160), qtd_previsto: qtd, atualizado_em: agora, atualizado_por: quem };
      if (it.id) {
        linha = linhas.filter(function (x) { return x.id === it.id; })[0];
        if (!linha) throw new Error(/^p\d+$/.test(String(it.id)) ? 'Só dá para mudar aqui as obras programadas no Sistema RDO. As do sistema Mariuá mudam lá.'
                                                                  : 'Essa obra programada não existe mais. Toque em Atualizar.');
        Object.assign(linha, dados);
      } else {
        linha = Object.assign({ id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uuidTeste(Date.now() % 1e9), criado_em: agora, criado_por: quem }, dados);
        linhas.push(linha);
      }
      await salvar('rdo_programacao', linhas);
      return Object.assign({ origem: 'rdo' }, linha);
    },
    rdo_programacao_excluir: async function (p) {
      if (!(await papel())) throw new Error('Só quem tem acesso à gestão tira obras da programação.');
      var linhas = await tabela('rdo_programacao'), resto = linhas.filter(function (x) { return x.id !== p.p_id; });
      if (resto.length === linhas.length) throw new Error('Essa obra programada não existe mais. Toque em Atualizar.');
      await salvar('rdo_programacao', resto);
      return null;
    },
    rdo_programacao_copiar: async function (p) {
      if (!(await papel())) throw new Error('Só quem tem acesso à gestão programa obras.');
      if (!p.p_de || !p.p_para) throw new Error('Escolha os dois dias.');
      if (p.p_de === p.p_para) throw new Error('Escolha dois dias diferentes.');
      var linhas = await tabela('rdo_programacao'), prog = await tabela('prog'), agora = new Date().toISOString(), quem = usuarioAtual();
      var origem = linhas.filter(function (x) { return x.data === p.p_de; }).sort(function (a, b) { return String(a.criado_em).localeCompare(String(b.criado_em)); });
      if (p.p_com_mariua) origem = origem.concat(prog.filter(function (x) { return x.data === p.p_de; }).map(function (x) {
        var eq = EQUIPES.filter(function (q) { return casa(norm(q.encarregado), norm(x.encarregado)); })[0];
        return { equipe_codigo: eq ? eq.codigo : null, encarregado: eq ? eq.encarregado : x.encarregado, pep: x.pep, nome_obra: x.nome_obra, municipio: x.municipio,
                 atividade: x.atividade, qtd_previsto: typeof x.qtd_previsto === 'number' ? x.qtd_previsto : null };
      }));
      var igual = function (a, b) { return norm(a.pep) === norm(b.pep) && norm(a.nome_obra) === norm(b.nome_obra) && norm(a.atividade) === norm(b.atividade); };
      var r = { copiadas: 0, repetidas: 0, sem_equipe: 0 };
      origem.forEach(function (o) {
        if (!o.equipe_codigo || (!o.pep && !o.nome_obra)) { r.sem_equipe++; return; }
        var ja = linhas.some(function (x) { return x.data === p.p_para && norm(x.equipe_codigo) === norm(o.equipe_codigo) && igual(x, o); }) ||
                 prog.some(function (x) { return x.data === p.p_para && casa(norm(x.encarregado), norm(o.encarregado)) && igual(x, o); });
        if (ja) { r.repetidas++; return; }
        linhas.push({ id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uuidTeste(Date.now() % 1e9 + r.copiadas), data: p.p_para,
                      equipe_codigo: o.equipe_codigo, encarregado: o.encarregado, pep: o.pep || null, nome_obra: o.nome_obra || null, municipio: o.municipio || null,
                      atividade: o.atividade || null, qtd_previsto: o.qtd_previsto == null ? null : o.qtd_previsto,
                      criado_em: agora, criado_por: quem, atualizado_em: agora, atualizado_por: quem });
        r.copiadas++;
      });
      await salvar('rdo_programacao', linhas);
      return r;
    },
    rdo_campo_servicos: async function () {
      return (await tabela('servicos_catalogo')).filter(function (x) { return x.ativo; })
        .map(function (x) { return { c: x.codigo, d: x.descricao, u: x.unidade, k: x.casas_decimais, g: x.grupo, ct: x.contrato }; });
    },
    rdo_campo_salvar_config: async function (p) {
      await soGestor('Só gestores podem mudar as configurações do app.');
      var d = p.p_dados || {};
      var dados = { aviso: String(d.aviso || '').trim().slice(0, 500), aviso_ativo: !!d.aviso_ativo,
                    fotos_minimas: Math.max(0, Math.min(10, parseInt(d.fotos_minimas, 10) || 0)), exigir_termino: !!d.exigir_termino,
                    versao_minima: String(d.versao_minima || '').trim().slice(0, 20),
                    motivos: (Array.isArray(d.motivos) ? d.motivos : []).map(function (m) { return String(m).trim().slice(0, 60); }).filter(Boolean).slice(0, 20) };
      await salvar('rdo_campo_config', [{ id: 1, dados: dados, atualizado_em: new Date().toISOString(), atualizado_por: usuarioAtual() }]);
      return dados;
    },
    rdo_campo_importar_servicos: async function (p) {
      await soGestor('Só gestores podem atualizar a lista de serviços.');
      var itens = Array.isArray(p.p_itens) ? p.p_itens : [], agora = new Date().toISOString(), quem = usuarioAtual();
      var atuais = await tabela('servicos_catalogo'), porChave = {}, contratos = {}, gravados = 0, inativos = 0;
      atuais.forEach(function (x) { porChave[x.contrato + '|' + x.codigo] = x; });
      itens.forEach(function (i) {
        if (!i.codigo || !i.descricao || !i.contrato) return;
        contratos[i.contrato] = 1;
        porChave[i.contrato + '|' + i.codigo] = { contrato: i.contrato, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade || null,
          casas_decimais: parseInt(i.casas, 10) || 0, grupo: i.grupo || null, ativo: true, atualizado_em: agora, atualizado_por: quem, _visto: true };
      });
      var lista = Object.keys(porChave).map(function (k) {
        var x = porChave[k];
        if (x._visto) { gravados++; delete x._visto; }
        else if (contratos[x.contrato] && x.ativo) { x.ativo = false; x.atualizado_em = agora; inativos++; }
        return x;
      });
      await salvar('servicos_catalogo', lista);
      return { gravados: gravados, inativos: inativos, contratos: Object.keys(contratos) };
    }
  };
  function rpc(nome, params) {
    var f = RPC[nome];
    if (!f) return Promise.resolve({ data: null, error: { message: 'Could not find the function public.' + nome } });
    return Promise.resolve().then(function () { return f(params || {}); })
      .then(function (d) { return { data: d === undefined ? null : d, error: null }; }, function (e) { return { data: null, error: { message: e.message || String(e) } }; });
  }

  // ─── fotos (arquivos) ───────────────────────────────────────────────────
  var storage = {
    from: function () {
      return {
        upload: async function (path, arquivo) { await pronto; await banco.gravarArquivo(path, arquivo); return { data: { path: path }, error: null }; },
        createSignedUrls: async function (paths) {
          var out = [];
          for (var i = 0; i < paths.length; i++) {
            var p = paths[i], url = null;
            if (/^exemplos\//.test(p)) url = BASE + p;
            else { var b = await banco.lerArquivo(p); if (b) url = URL.createObjectURL(b); }
            out.push({ path: p, signedUrl: url, error: url ? null : 'Object not found' });
          }
          return { data: out, error: null };
        }
      };
    }
  };

  // ─── aviso entre as abas (o "tempo real" do teste) ──────────────────────
  var canais = [], espera = null;
  function channel() {
    var c = { cb: null, on: function (tipo, filtro, cb) { c.cb = cb; return c; }, subscribe: function () { canais.push(c); return c; }, unsubscribe: function () {} };
    return c;
  }
  if (canal) canal.onmessage = function (e) {
    var d = e.data || {};
    if (d.recomecar) { setTimeout(function () { location.reload(); }, 400); return; }
    canais.forEach(function (c) { try { if (c.cb) c.cb({ new: {}, eventType: 'UPDATE', table: d.tabela }); } catch (x) {} });
    if ((d.tabela === 'rdo_campo' || d.tabela === 'rdo_campo_aparelhos') && typeof window.gaAtualizar === 'function') {
      clearTimeout(espera); espera = setTimeout(function () { window.gaAtualizar(); }, 400);
    }
  };

  window.supabase = {
    createClient: function () {
      return { auth: auth, from: function (t) { return new Consulta(t); }, rpc: rpc, storage: storage, channel: channel, removeChannel: function () {} };
    }
  };

  // ─── selo "MODO DE TESTE", dicas e recomeçar ────────────────────────────
  function recomecar() {
    var tx = 'Modo de teste: os dados são de exemplo e ficam só neste navegador.\n' +
      'Para ver um RDO chegar, abra a gestão de teste e o app de teste em duas abas deste navegador.\n\n' +
      'Recomeçar o teste? Os RDOs enviados no teste são apagados e os dados de exemplo voltam ao início.';
    if (!confirm(tx)) return;
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('rdo-teste-') === 0) localStorage.removeItem(k); }); } catch (e) {}
    if (canal) canal.postMessage({ recomecar: true });
    banco.fechar();
    var faltam = 2, voltar = function () { if (--faltam <= 0) location.reload(); };
    [NOME_DB, 'rdo-campo-teste'].forEach(function (n) {
      var r = indexedDB.deleteDatabase(n);
      r.onsuccess = r.onerror = voltar; r.onblocked = function () { setTimeout(function () { location.reload(); }, 300); };
    });
    setTimeout(function () { location.reload(); }, 2500);
  }
  function marcar() {
    var css = document.createElement('style');
    css.textContent = '.rdo-teste-tag{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + ' + (TIPO === 'campo' ? '45px' : '58px') + ');z-index:9999;' +
      'border:0;border-radius:999px;padding:5px 12px;background:#ffd166;color:#3a2a00;font:800 11px/1.2 Barlow,system-ui,sans-serif;letter-spacing:1px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer}' +
      '.rdo-teste-dica{margin:4px 0 0;padding:10px 12px;border-radius:10px;background:#fff7e0;color:#5a4300;font:600 .88rem/1.4 Barlow,system-ui,sans-serif}';
    document.head.appendChild(css);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'rdo-teste-tag'; b.textContent = 'MODO DE TESTE';
    b.title = 'Dados de exemplo, guardados só neste navegador. Toque para recomeçar.';
    b.addEventListener('click', recomecar);
    document.body.appendChild(b);
    // na gestão de teste, o selo do topo avisa que o banco é o de teste
    var selo = document.getElementById('db-text');
    if (selo) new MutationObserver(function () {
      if (selo.textContent === 'Banco conectado') selo.textContent = 'Banco de teste';
    }).observe(selo, { childList: true, characterData: true, subtree: true });
    var dica = function (el, tx) { if (!el) return; var p = document.createElement('p'); p.className = 'rdo-teste-dica'; p.textContent = tx; el.insertBefore(p, el.firstChild); };
    dica(document.getElementById('g-form-login'), 'Modo de teste: entre com joao.araujo (gestor), maria.escritorio (escritório) ou alan (encarregado), com qualquer senha. Contas criadas na aba Usuários usam a senha definida.');
    dica(document.getElementById('form-login'), 'Modo de teste: entre com alan ou bruno, com qualquer senha. Contas criadas na gestão de teste usam a senha definida lá.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', marcar); else marcar();
})();
