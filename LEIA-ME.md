# App RDO de campo

App de celular para o encarregado lançar o RDO com fotos. Usa o mesmo login e o mesmo Supabase do sistema, funciona sem internet e envia sozinho quando o sinal volta. O escritório vê tudo na tela RDO do site, na seção "RDO pelo app".

## O que entra no repositório

Tudo fica na raiz do repositório. A pasta `campo/` é o app, que abre em `endereço-do-site/campo/`. O `rdo_campo.sql` cria no Supabase a tabela dos RDOs, o local das fotos, a lista de serviços, o login por usuário, o que a página de gestão usa e as permissões. O `rdo-app.js` monta a seção "RDO pelo app" dentro da tela RDO, e o `rdo.html` é igual ao atual, com uma linha a mais no fim que carrega esse arquivo. O `gestao-app.html` e o `gestao-app.js` são a página de gestão do app. O `nav.js` e o `mariua-auth.js` são os do site com uma linha a mais em cada, para a página nova aparecer no menu e nas permissões.

## Como colocar no ar

Primeiro, no Supabase, abra SQL Editor → New query, cole o `rdo_campo.sql` inteiro e clique em Run (pode rodar de novo sem perder nada). Depois copie os arquivos para o repositório, substituindo o `rdo.html`, e publique como sempre. Depois, na tela RDO, importe a lista de serviços (veja abaixo). Por fim, clique em "Instalar no celular": aparece o QR code e o link para mandar aos encarregados.

Cada encarregado precisa de uma conta criada no Admin. No app ele entra com usuário e senha: o usuário é o começo do e-mail da conta, antes do @ (joao.araujo para joao.araujo@empresa), e o e-mail inteiro também funciona. Se não houver e-mail com esse começo, o app procura pela matrícula do cadastro. Se dois e-mails começarem igual, o app pede o e-mail completo. Se a matrícula dele estiver no cadastro do usuário e no Cadastro de Equipes, o app já sugere a equipe certa no primeiro acesso.

## Como funciona

O app busca, por funções do banco, só o que a equipe precisa: a lista do Cadastro de Equipes, a Programação do dia (com quem trabalha com o encarregado) e a lista de serviços. Tudo o que o encarregado preenche fica salvo no celular na hora. Ao tocar em Enviar, as fotos sobem para o bucket `rdo-fotos` e o RDO para a tabela `rdo_campo`. Cada RDO tem um id gerado no celular, então um reenvio depois de queda de sinal nunca duplica. O app não grava nada no `turno_data`.

O envio acontece com o app aberto. Se o encarregado fechar o app sem sinal, o RDO sobe na próxima vez que ele abrir com internet.

Cada foto sai com um carimbo de data, hora, equipe, coordenadas e obra. Foto escolhida da galeria vem marcada como "Foto da galeria, sem localização".

## Lista de serviços (apontamento)

O encarregado aponta o que a equipe fez escolhendo o serviço na mesma lista do sistema da concessionária (a precificação de serviços, com códigos como BA_01). Ele procura pelo nome ou pelo código, filtra por grupo (linha morta, linha viva, poda, LC, retro) e informa a quantidade na unidade do serviço: poste é número inteiro, cabo em metro e condutor em kg aceitam casas decimais, conforme a coluna "Nº Casas Decimais" do arquivo. Quando o RDO começa pela Programação, a atividade programada aparece como dica e os serviços parecidos vêm primeiro; os serviços mais usados no celular também ficam no topo. Se um serviço não estiver na lista, ele pode ser apontado escrevendo, e chega ao escritório marcado como "fora da lista".

Para carregar ou atualizar a lista, exporte a precificação de serviços no sistema da concessionária e, na tela RDO, clique em "Lista de serviços" → "Importar precificação (.csv)". O site mostra quantos serviços são novos, alterados ou saem da lista antes de gravar. A lista nova substitui a do mesmo contrato; o que saiu fica inativo, sem apagar o histórico. Só gestor pode importar (a função do banco confere pelo `is_gestor()`). Os preços do arquivo não são gravados: o app não precisa deles e o encarregado não vê valores. Os celulares pegam a lista nova quando abrem o app com internet; ela fica guardada para funcionar sem sinal.

Hoje o arquivo tem um contrato (OBRAS - BA). Se vierem listas de outros contratos, cada equipe vê a do seu estado, pelo final do código da equipe (IRC, JAC, FSA e SRR na Bahia; PA e ITA em Minas; AJU em Sergipe).

## Página de gestão (App de campo)

No site, em Gestão → App de campo. A Visão geral mostra os números do período (RDOs recebidos, equipes que mandaram, fotos, horas paradas, serviços fora da lista e celulares com fila parada), quem estava programado hoje e ainda não mandou RDO, e o que precisa ser conferido. Em RDOs ficam todos os RDOs do período, com busca, filtros, o RDO completo com fotos e download em CSV. Produção soma a quantidade de cada serviço da lista, por serviço ou por equipe, também com CSV. Equipes mostra a situação de cada equipe do Cadastro, e Celulares mostra a versão do app, o último contato e a fila de envio de cada celular. Em Configurações, o gestor define o recado para os encarregados, as fotos mínimas por RDO, se o horário de término é obrigatório, os motivos de paralisação e a versão mínima do app; ali também ficam a lista de serviços e o QR code.

Para liberar a página para alguém, marque a tela "App de campo (gestão)" no Admin. Só gestor salva as configurações (a função do banco confere). Os celulares informam versão, fila e último contato ao abrir o app e depois de cada envio, e aplicam as configurações na próxima vez que abrirem com internet.

Se o `nav.js` ou o `mariua-auth.js` mudaram no repositório desde o zip que vocês mandaram, não substitua: acrescente à mão a linha nova de cada um. No `nav.js`, no grupo Gestão: `{ href: 'gestao-app.html', icone: 'device-mobile', texto: 'App de campo' },`. No `mariua-auth.js`, na lista TELAS: `{ id:'appcampo', nome:'App de campo (gestão)', arquivos:['gestao-app.html'] },`.

## Espaço das fotos

Cada foto fica com cerca de 250 a 450 KB (lado maior de 1600 px). Com 80 equipes mandando 6 fotos por dia, são uns 170 MB por dia, então confira o limite de armazenamento do plano do Supabase de vocês. Para fotos menores, ajuste `FOTO_LADO` e `FOTO_QUALIDADE` no começo do `campo/app.js`.

## Publicar uma versão nova do app

Depois de mudar qualquer arquivo de `campo/`, abra o `campo/sw.js` e troque o `VERSAO` (por exemplo de `1.2.1` para `1.2.2`). Esse é o único lugar da versão: o app e a página de gestão leem dali. No mesmo arquivo, as `NOVIDADES` são até três linhas curtas que aparecem no aviso para o encarregado; vale escrever o que mudou para ele, em palavras do dia a dia.

O celular confere se há versão nova ao abrir o app, ao voltar para ele, quando a internet volta e a cada 15 minutos com o app aberto. A versão nova baixa em segundo plano e, quando fica pronta, aparece o aviso "Nova versão do app" com Atualizar agora e Depois. Atualizar agora troca na hora: o rascunho fica salvo, um envio de fotos em andamento termina antes, e o app volta para a mesma tela. Quem toca em Depois continua na versão atual; a atualização fica como recado na tela inicial e o aviso volta na próxima vez que ele abrir o app. Em Ajustes, "Procurar atualização do app" confere na hora.

Para exigir a versão nova, coloque-a em Versão mínima, nas Configurações da página de gestão: o aviso aparece sem o botão Depois. Na aba Celulares da gestão dá para ver quem já atualizou.
