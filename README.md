# Nox Trees para ComfyUI

Histórico de gerações em árvore, em um painel sobre a lateral direita. Extensão local, sem dependências adicionais e sem serviços externos.

## Instalação

Copie `__init__.py` e a pasta `web` para `ComfyUI/custom_nodes/nox-generation-trees/`. Reinicie o ComfyUI e atualize a página. Clique em **🌿 Versões**, no canto superior direito.

## Uso

- A engrenagem **History settings** permite escolher **Vertical — right sidebar** ou **Horizontal — bottom panel**. A escolha é salva neste navegador.
- No modo horizontal, o histórico aparece em um painel próprio sobre a parte inferior do canvas, com versões da esquerda para a direita. **Close** o recolhe; **Versions & history**, no canto inferior, o reabre. Esse painel não é uma aba do console de logs.

### Atualização: resultados e workflows

- Workflows com IDs diferentes passam a ter árvores independentes. Ao trocar de workflow, o painel procura sua árvore; a captura também verifica o ID antes de cada envio. Árvores antigas permanecem disponíveis em **Open**.
- Runs consecutivos com a mesma configuração são agrupados na mesma versão, mesmo quando apenas as seeds numéricas mudam. O seletor **Result** permite escolher cada execução com sua seed, status, imagens e workflow próprios. Nenhum resultado é descartado.
- **Continue from here** usa o resultado selecionado e inicia uma ramificação explícita, mesmo se a configuração não mudar. Alterações de prompt, LoRA ou outros parâmetros criam uma nova versão.
- A comparação agora inclui o texto completo dos campos alterados em **Before / After**, destacando o trecho substituído. Não é apenas o resumo truncado.
- O agrupamento vale para novas gerações. As versões antigas não são reorganizadas retroativamente.

- Execute o workflow normalmente: cada envio aceito cria uma versão com o workflow, a configuração enviada e os previews. Edições sem geração não criam versões.
- **Continuar daqui** restaura uma versão. A próxima geração será filha dela; voltar novamente ao mesmo ponto cria uma ramificação irmã.
- Escolha **Manter seed fixa** ou **Usar seed aleatória**. A preferência pode ser lembrada por árvore e redefinida em **Opção de seed**.
- **Salvar árvore** grava no computador. As gerações e alterações também são salvas automaticamente em `ComfyUI/user/default/nox-trees/` (ou no diretório do usuário ativo).
- **Abrir** recupera árvores salvas; escolha uma versão e **Continuar daqui** para restaurar seu workflow.
- **Exportar/Importar** transfere uma árvore em JSON, incluindo miniaturas incorporadas. Modelos, LoRAs, imagens de entrada e imagens originais não são incluídos; precisam continuar disponíveis para gerar ou abrir o resultado em resolução original.
- Selecione **Comparar** em duas versões para ver previews lado a lado e diferenças. Também é possível renomear, favoritar e recolher ramos.
- Antes de restaurar uma versão, a extensão guarda a edição atual. **Recuperar edição anterior** reabre essa cópia.

## Limites desta versão

- Fixação automática para widgets numéricos `seed` e `noise_seed`, com `control_after_generate`. Nós personalizados com controles próprios e seeds dentro de subgrafos podem exigir ajuste manual; seeds não encontradas geram aviso. Seeds fornecidas por conexões não são alteradas automaticamente.
- O indicador de seed descreve a última restauração, não monitora alterações manuais posteriores nos widgets.
- Use uma árvore em uma aba por vez para evitar gravações concorrentes. Ao reabrir a página ou outra árvore, clique em **Continuar daqui** antes de gerar a partir dela; sem isso a próxima geração inicia uma nova raiz.
- Previews de saídas `images` são incorporados em JPEG com até 360 px; vídeos e outros tipos de saída não têm preview nesta versão.
- O painel ocupa a área direita sobre o Workflow Overview; o botão **🌿 Versões** permite alternar entre os dois.
- O histórico começa nas gerações feitas com a extensão carregada. O arquivo salvo não depende de manter o histórico do servidor, mas execuções pendentes precisam dele para recuperar resultados após fechar a página.

## Verificação

`node --test tests/core.test.mjs`

`tests/preview_server.py` é um proxy de desenvolvimento em `127.0.0.1:8190`, com ComfyUI em `127.0.0.1:8188`, para testar sem reiniciar o servidor. Não faz parte da instalação.
