import { ESTADO } from '../core/state.js';
import { CONFIGURACAO, TEMPOS, INFORMACAO_TRAPACEIRO } from '../core/config.js';
import { Armazenamento } from '../core/storage.js';
import { SistemaAudio } from '../core/audio.js';
import { Logica } from '../core/logic.js';
import { Visualizacao } from './visualization.js';
import { DEFINICOES_CONQUISTAS } from '../core/achievements.js';

export const ParteFluxo = {
    TEMPOS: TEMPOS,

    _esperar(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    },

    /**
     * Hierarquia de Defesas Centralizada
     * @param {Object} atirador 
     * @param {Object} alvo 
     * @param {string} tipo - 'vingador', 'justiceiro', 'caos'
     * @param {boolean} ehMorteOriginal - Se o tiro seria fatal antes das defesas
     * @returns {Object} { ehMorte: boolean, armaTravou: boolean }
     */
    _processarDefesasHierarquicas(atirador, alvo, tipo, ehMorteOriginal) {
        const atiradorEhTrapaceiro = this._ehTrapaceiro(ESTADO.jogo.jogadores.indexOf(atirador));
        const alvoEhTrapaceiro = this._ehTrapaceiro(ESTADO.jogo.jogadores.indexOf(alvo));
        const atiradorEmFrenesi = atiradorEhTrapaceiro && atirador.contadorVirtual >= 8;

        // 0. FRENESI (🔥): Ignora todas as defesas e mata (Exceto Última Chance em si mesmo no Massacre)
        if (atiradorEmFrenesi) {
            console.log(`🔥 ${atirador.nome}: Frenesi ignora defesas!`);
            return { ehMorte: true, armaTravou: false, tipoAtivado: 'frenesi' };
        }

        // 1. 😂 PIADA (Atirador Trapaceiro vs Comparsa Trapaceiro)
        // Segundo a Nova Lei v2.3: Tiro contra comparsa é uma piada.
        if (atiradorEhTrapaceiro && alvoEhTrapaceiro) {
            // Regra 2.2: Tiro fatal em comparsa com Piada
            if (ehMorteOriginal && !alvo._habilidadesUsadas.piada) {
                alvo._habilidadesUsadas.piada = true;
                ESTADO.jogo.historicoMesa.piada = true;
                console.log(`😂 ${alvo.nome}: Piada ativada! (Alvo consumiu para sobreviver ao tiro fatal de ${atirador.nome})`);
                return { ehMorte: false, armaTravou: true, tipoAtivado: 'piada' };
            }

            // Regra 2.1: Tiro NÃO fatal em comparsa (sempre incrementa sem resetar)
            if (!ehMorteOriginal) {
                console.log(`😂 ${atirador.nome} atirou em ${alvo.nome}: Piada (c11+1 e sem reset).`);
                return { ehMorte: false, armaTravou: false, tipoAtivado: 'piada' };
            }

            // Regra 2.3: Tiro fatal sem Piada (Tenta a próxima defesa na hierarquia)
            console.log(`😂 ${atirador.nome} atirou fatal em ${alvo.nome} (Sem Piada). Tentando próxima defesa...`);
            // Continua para as defesas abaixo...
        }

        if (!ehMorteOriginal) return { ehMorte: false, armaTravou: false };

        // Se alvo não for Trapaceiro, ele não tem mais defesas
        if (!alvoEhTrapaceiro) return { ehMorte: true, armaTravou: false };

        // 2. DEFESAS ESPECÍFICAS DO ALVO (Só se alvo é Trapaceiro)

        // A) 🤹‍♂️ VIGARICE (Contra Vingador)
        if (tipo === 'vingador' && !alvo._habilidadesUsadas.vigarice && alvo.contadorVirtual < 5) {
            if (atiradorEhTrapaceiro && alvoEhTrapaceiro) {
                // Trapaceiro vs Trapaceiro: Configuração Furtiva (m1 c0)
                atirador.armaAtaque.bala = 0; // m1
                atirador.armaAtaque.contador = 0; // c0
                console.log(`🤹‍♂️ Dev: ${alvo.nome} usou Vigarice Furtiva. ${atirador.nome} configurado para m1 c0.`);
            } else {
                // Inocente vs Trapaceiro: Estado "Pré-Tiro Fatal" (m+1, v+1)
                if (alvo.arma.bala < 5) {
                    alvo.arma.bala++;
                    alvo.contadorVirtual++;
                } else {
                    // Caso Limite m6: Mantém m6 e ajusta v5 para garantir 2 disparos (v5 seguro, v6 fatal)
                    alvo.arma.bala = 5;
                    alvo.contadorVirtual = 5;
                }
                console.log(`🤹‍♂️ ${alvo.nome}: Vigarice ativada (Estado Pré-Fatal)!`);
            }
            alvo._habilidadesUsadas.vigarice = true;
            ESTADO.jogo.historicoMesa.vigarice = true;

            // Se for comparsa, trava a arma para não perder o tiro fatal (Regra 2.3)
            const ehComparsa = atiradorEhTrapaceiro && alvoEhTrapaceiro;
            return { ehMorte: false, armaTravou: ehComparsa, tipoAtivado: 'vigarice' };
        }

        // B) 🎭 ILUSÃO (Contra Justiceiro)
        if (tipo === 'justiceiro' && !alvo._habilidadesUsadas.ilusao) {
            // Reset REAL da arma do Justiceiro
            atirador.arma.contador = 0;
            atirador.arma.bala = Math.floor(Math.random() * 6);
            alvo._habilidadesUsadas.ilusao = true;
            ESTADO.jogo.historicoMesa.ilusao = true;
            console.log(`🎭 ${alvo.nome}: Ilusão ativada!`);

            // Se for comparsa, trava a arma para não perder o tiro fatal (Regra 2.3)
            const ehComparsa = atiradorEhTrapaceiro && alvoEhTrapaceiro;
            return { ehMorte: false, armaTravou: ehComparsa, tipoAtivado: 'ilusao' };
        }

        // C) 🛡️ RICOCHETE (No Caos)
        if (tipo === 'caos' && !alvo._habilidadesUsadas.ricochete) {
            alvo._habilidadesUsadas.ricochete = true;
            ESTADO.jogo.historicoMesa.ricochete = true;
            console.log(`🛡️ ${alvo.nome}: Ricochete ativado!`);

            // No Ricochete, a bala é redirecionada, mas se for contra comparsa, 
            // a regra 2.3 de travar a arma para preservar o fatal se aplica aos trapaceiros.
            const ehComparsa = atiradorEhTrapaceiro && alvoEhTrapaceiro;
            return { ehMorte: false, armaTravou: ehComparsa, tipoAtivado: 'ricochete', ricocheteAtivou: true };
        }

        // 3. 🚫 PARE (Residual / Última Linha)
        if (!alvo._habilidadesUsadas.pare && alvo.contadorVirtual < 7 && !alvo.emDesespero) {
            alvo._habilidadesUsadas.pare = true;
            ESTADO.jogo.historicoMesa.pare = true;
            console.log(`🚫 ${alvo.nome}: Pare ativado!`);
            return { ehMorte: false, armaTravou: true, tipoAtivado: 'pare' };
        }

        return { ehMorte: true, armaTravou: false, tipoAtivado: null };
    },

    /**
     * Verifica se o disparo do Trapaceiro seria fatal (FASE 2 - INC-009)
     * @param {Object} trapaceiro 
     * @returns {boolean} 
     */
    _verificarMortePotencialTrapaceiro(trapaceiro) {
        const acertouLetal = trapaceiro.armaAtaque.contador === trapaceiro.armaAtaque.bala;
        const acertouPassiva = trapaceiro.arma.contador === trapaceiro.arma.bala;
        const emFrenesi = trapaceiro.contadorVirtual >= 8;
        return acertouLetal || acertouPassiva || emFrenesi;
    },

    /**
     * Incrementa os contadores do Trapaceiro após o disparo
     * @param {Object} trapaceiro 
     * @param {boolean} armaTravou - Se ativou Pare (🚫)
     */
    _incrementarArmasTrapaceiro(trapaceiro, armaTravou = false) {
        // Se a arma NÃO travou (residual do Pare), incrementa o contador real das duas armas
        if (!armaTravou) {
            trapaceiro.armaAtaque.contador++;
            if (trapaceiro.armaAtaque.contador > 3) trapaceiro.armaAtaque.contador = 0; // Letal é 0-3

            trapaceiro.arma.contador++;
            if (trapaceiro.arma.contador > 5) trapaceiro.arma.contador = 0; // Normal é 0-5
        }
        // O contador virtual SEMPRE sobe porque o turno foi gasto
        trapaceiro.contadorVirtual++;
    },

    /**
     * Double Shot: Trapaceiro atira em alvo usando AMBAS armas (FASE 2 - INC-009)
     * @param {Object} trapaceiro - Jogador trapaceiro
     * @param {Object} alvo - Alvo do disparo
     * @returns {boolean} ehMorte - Se o alvo morreu
     */
    _dispararTrapaceiroContraAlvo(trapaceiro, alvo) {
        // MANTIDO PARA COMPATIBILIDADE TEMPORÁRIA, MAS SERÁ ELIMINADO
        const ehMorte = this._verificarMortePotencialTrapaceiro(trapaceiro);
        this._incrementarArmasTrapaceiro(trapaceiro);
        if (ehMorte) trapaceiro._mortesNaMesa++;
        return ehMorte;
    },

    manipularBalaDev(indice, tipo = 'passiva') {
        if (!ESTADO.devMode) return;
        const p = ESTADO.jogo.jogadores[indice];
        if (!p || !p.vivo) return;

        const ehTrapaceiro = ESTADO.jogo.papeis[indice] === 'trapaceiro';

        // Nova Lei v2.3: Arma Especial (Rosa) tem marcador fixo 6/6
        if (tipo === 'passiva' && ehTrapaceiro && p.armaPassivaTipo === 'especial') {
            this.atualizarStatus('⚠️', 'Desligue a arma passiva especial para alterar valores.');
            console.log(`⚠️ Dev: ${p.nome} marcador Rosa é imutável.`);
            return;
        }

        if (tipo === 'letal' && ehTrapaceiro && p.armaAtaque) {
            const max = 4;
            const arma = p.armaAtaque;
            arma.bala = (arma.bala + 1) % max;

            // Ponto 2: Se contador > 0, o marcador pula o passado (mínimo aceitável é o contador)
            if (arma.contador > 0 && arma.bala < arma.contador) {
                arma.bala = arma.contador;
            }
            console.log(`🔧 Dev: ${p.nome} marcador ataque (m11=${arma.bala + 1}/4)`);
        } else {
            const max = 6;
            const arma = p.arma;
            arma.bala = (arma.bala + 1) % max;

            // Ponto 2: Se contador > 0, o marcador pula o passado
            if (arma.contador > 0 && arma.bala < arma.contador) {
                arma.bala = arma.contador;
            }
            console.log(`🔧 Dev: ${p.nome} marcador defesa (m1=${arma.bala + 1}/6)`);
        }

        this.renderizarListaJogadores();
    },

    manipularContadorDev(indice, tipo = 'passiva') {
        if (!ESTADO.devMode) return;
        const p = ESTADO.jogo.jogadores[indice];
        if (!p || !p.vivo) return;

        if (tipo === 'letal') {
            const arma = p.armaAtaque;
            // Cenário 1: Se já é fatal, move ambos (preserva o perigo)
            if (arma.contador === arma.bala) {
                arma.contador = (arma.contador + 1) % 4;
                arma.bala = (arma.bala + 1) % 4;
            } else {
                // Caso normal (Cenário 2 e 4)
                arma.contador = (arma.contador + 1) % 4;
            }
        } else {
            const arma = p.arma;
            // Ponto 2: No dev, o contador é independente para permitir testar estados
            arma.contador = (arma.contador + 1) % 6;

            p.contadorVirtual = arma.contador;

            // Ponto 3: Resetar estados se voltar ao início
            if (arma.contador === 0) {
                p.contadorVirtual = 0;
                p.emDesespero = false;
                console.log(`🔄 Dev: ${p.nome} resetado (c1=0 v1=0).`);
            }

            // MANUAL: Induzir desespero ao chegar em 5 (permite testar o estado antes do limite fatal 8)
            if (p.contadorVirtual >= 5 && !p.emDesespero) {
                p.emDesespero = true;
                console.log(`😱 Dev: ${p.nome} em desespero induzido.`);
            }
        }

        this.renderizarListaJogadores();
    },

    reviverJogadorDev(indice) {
        if (!ESTADO.devMode) return;
        const p = ESTADO.jogo.jogadores[indice];
        if (!p || p.vivo) return;

        p.vivo = true;
        p.contadorVirtual = 0;
        Logica.resetarArma(p);

        const ehTrapaceiro = ESTADO.jogo.papeis[indice] === 'trapaceiro';
        if (ehTrapaceiro) {
            Logica.resetarArma(p, 'letal');
            p.armaPassivaTipo = 'especial'; // Devolve arma especial ao reviver
            p.arma.bala = 5;
        }

        console.log(`👼 Dev: ${p.nome} revivido!`);
        this.renderizarListaJogadores();
        this.atualizarStatus('✨', `${p.nome} voltou dos mortos!`);
    },

    async avancarTurno() {
        if (!ESTADO.devMode || ESTADO.jogo.atirando) return;

        ESTADO.jogo.atirando = true;
        ESTADO.jogo.botoesBloqueados = true;

        // Escolher jogador vivo aleatório
        const vivos = ESTADO.jogo.jogadores.filter(p => p.vivo);
        if (vivos.length === 0) return;

        const jogador = vivos[Math.floor(Math.random() * vivos.length)];
        const indice = ESTADO.jogo.jogadores.indexOf(jogador);
        const emojiJogador = this.obterEmoji(jogador.perfil);

        // Mostrar "{jogador} atirou" por 1000ms
        this.atualizarStatus(emojiJogador, `${jogador.nome} atirou`);
        await this._esperar(1000);

        // Determinar resultado (aleatório)
        const acertou = Math.random() < 0.3; // 30% chance de morrer

        if (acertou) {
            // POW - jogador morre
            jogador.vivo = false;
            this.atualizarStatus('💥', 'POW!');
            await this._esperar(500);
            this.renderizarListaJogadores();
            this.verificarFluxoJogo(indice);
        } else {
            // CLICK - sobrevive
            this.atualizarStatus('💨', 'CLICK!');
            await this._esperar(500);

            // Incrementar contador da arma
            if (jogador.arma) {
                jogador.arma.contador++;
                jogador.contadorVirtual++;
                if (jogador.arma.contador > 5) jogador.arma.contador = 0;
            }

            this.renderizarListaJogadores();
            this.verificarFluxoJogo(indice);
        }

        ESTADO.jogo.botoesBloqueados = false;
        this.renderizarPaineisLaterais();
    },

    inicializar() {
        this.renderizarConfiguracao();
        if (!ESTADO.slots || ESTADO.slots.length === 0)
            ESTADO.slots = [null, null, null, null, null, null];
        else if (ESTADO.slots.filter(Boolean).length === 0)
            ESTADO.slots = [null, null, null, null, null, null];

        if (!localStorage.getItem('mentiroso_visited')) {
            Visualizacao.mostrarModal(
                'BEM-VINDO!',
                'Recomendamos ler as regras antes de começar.',
                [
                    {
                        texto: 'LER REGRAS',
                        classe: 'primario',
                        acao: () => {
                            Visualizacao.fecharModal();
                            this.irPara('regras');
                            localStorage.setItem('mentiroso_visited', 'true');
                        },
                    },
                    {
                        texto: 'JÁ SEI JOGAR',
                        classe: 'secundario',
                        acao: () => {
                            Visualizacao.fecharModal();
                            localStorage.setItem('mentiroso_visited', 'true');
                        },
                    },
                ],
            );
        }
    },

    irPara(idTela) {
        document
            .querySelectorAll('.tela')
            .forEach((s) => s.classList.remove('ativa'));
        const alvo = document.getElementById('tela-' + idTela);
        if (alvo) alvo.classList.add('ativa');
        if (idTela === 'estatisticas') this.renderizarEstatisticas();
    },

    iniciarTestes() {
        if (!ESTADO.devMode) {
            this.irPara('configuracao');
            return;
        }

        this.inicializarPartida();

        // Se modo direto estiver ON, inicializarPartida já chamou iniciarTelaJogo
        if (ESTADO.devMode && ESTADO.devDireto) return;

        if (ESTADO.jogo.modoTrapaceiro) {
            this.irPara('revelacao');
        } else {
            this.irPara('carregamento');
        }
    },

    sairRegras() {
        if (ESTADO.jogo && ESTADO.jogo.ativo) this.irPara('jogo');
        else this.irPara('inicio');
    },

    inicializarPartida() {
        const nomesJogadores = ESTADO.slots.filter(Boolean);
        const perfisDisponiveis = Object.keys(CONFIGURACAO.perfis);
        for (let i = perfisDisponiveis.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [perfisDisponiveis[i], perfisDisponiveis[j]] = [
                perfisDisponiveis[j],
                perfisDisponiveis[i],
            ];
        }
        if (ESTADO.jogo.modoTrapaceiro) {
            this.atribuirPapeis();
        } else {
            ESTADO.jogo.papeis = nomesJogadores.map(() => 'jogador');
            ESTADO.jogo.trapaceiros = [];
        }

        ESTADO.jogo.jogadores = nomesJogadores.map((nome, idx) => {
            const ehTrapaceiro = ESTADO.jogo.papeis[idx] === 'trapaceiro';
            return Logica.criarJogador(
                nome,
                perfisDisponiveis[idx % perfisDisponiveis.length],
                ehTrapaceiro
            );
        });

        ESTADO.jogo.indiceVez = Math.floor(
            Math.random() * nomesJogadores.length,
        );
        ESTADO.jogo.narrador = Logica.obterNarrador();
        ESTADO.jogo.cartaMesa = ['K', 'Q', 'A'][Math.floor(Math.random() * 3)];
        ESTADO.jogo.turnosMesa = 0;
        ESTADO.jogo.mesasCompletadas = 0;
        ESTADO.jogo.baralhoFrasesMorte = [...CONFIGURACAO.morte.frasesClique];
        Logica.embaralhar(ESTADO.jogo.baralhoFrasesMorte);
        ESTADO.jogo.indiceFraseMorte = 0;
        ESTADO.jogo.jogadores.forEach((p) => (p._temp = {}));

        ESTADO.jogo.ativo = true;
        ESTADO.jogo.atirando = false;
        ESTADO.jogo.ehMassacre = false;
        ESTADO.jogo.indiceProtegido = null;
        ESTADO.jogo.caos.ativo = false;
        ESTADO.jogo.doseDupla.ativo = false;
        ESTADO.jogo.trapaceiroNaMira = false;
        ESTADO.jogo.fraseTrapaceiroUsada = false;
        ESTADO.jogo.travamentoAtivado = false;

        if (ESTADO.devMode && ESTADO.devDireto) {
            console.log('⏩ DEV DIRETO: Pulando intro e revelação.');
            this.iniciarTelaJogo();
            return;
        }

        if (ESTADO.jogo.modoTrapaceiro) {
            this.iniciarRevelacaoPapel();
        } else {
            this.mostrarCarregamento();
        }
    },

    atribuirPapeis() {
        const jogadores = ESTADO.slots.filter(Boolean);
        const contagem = jogadores.length;
        let contagemTrapaceiros = 1;
        if (contagem >= 6) contagemTrapaceiros = 2; // 6 ou 7 jogadores = 2 trapaceiros
        let indices = jogadores.map((_, i) => i);
        Logica.embaralhar(indices);
        ESTADO.jogo.trapaceiros = indices.slice(0, contagemTrapaceiros);
        ESTADO.jogo.papeis = jogadores.map((_, i) =>
            ESTADO.jogo.trapaceiros.includes(i) ? 'trapaceiro' : 'jogador',
        );
        ESTADO.jogo.protecaoComparsaUsada = {};
    },

    iniciarRevelacaoPapel() {
        if (ESTADO.devMode && ESTADO.devDireto) {
            console.log('⏩ DEV DIRETO: Pulando revelação de papéis.');
            this.mostrarCarregamento();
            return;
        }

        ESTADO.jogo.revelacaoPapel = {
            ativo: true,
            indiceAtual: 0,
            virado: false,
            podeInteragir: true,
        };
        this.renderizarTelaRevelacao();
        this.irPara('revelacao');

        const btnPular = document.getElementById('btn-pular-revelacao');
        if (ESTADO.devMode) {
            btnPular.style.display = 'block';
        } else {
            btnPular.style.display = 'none';
        }
    },

    renderizarTelaRevelacao() {
        const jogadores = ESTADO.slots.filter(Boolean);
        const atual = ESTADO.jogo.revelacaoPapel.indiceAtual;
        document.getElementById('nome-jogador-revelacao').textContent =
            `${jogadores[atual]}`;
        const virador = document.getElementById('virador-carta-revelacao');
        virador.classList.remove('virado');
        document.getElementById('texto-instrucao-revelacao').textContent =
            'Toque na carta para revelar';
        ESTADO.jogo.revelacaoPapel.virado = false;
        ESTADO.jogo.revelacaoPapel.podeInteragir = true;
    },

    async manipularCliqueRevelacao() {
        if (!ESTADO.jogo.revelacaoPapel.podeInteragir) return;
        const jogadores = ESTADO.slots.filter(Boolean);
        const indiceAtual = ESTADO.jogo.revelacaoPapel.indiceAtual;
        const virador = document.getElementById('virador-carta-revelacao');
        const instrucao = document.getElementById('texto-instrucao-revelacao');

        if (!ESTADO.jogo.revelacaoPapel.virado) {
            const papel = ESTADO.jogo.papeis[indiceAtual];
            const info = INFORMACAO_TRAPACEIRO[papel];
            document.getElementById('titulo-papel-revelacao').textContent =
                info.titulo;
            document.getElementById('titulo-papel-revelacao').style.color =
                papel === 'trapaceiro' ? '#8a0303' : '#000';
            let desc = info.descricao;
            if (papel === 'trapaceiro' && ESTADO.jogo.trapaceiros.length > 1) {
                const indiceParceiro = ESTADO.jogo.trapaceiros.find(
                    (i) => i !== indiceAtual,
                );
                const nomeParceiro = jogadores[indiceParceiro];
                desc += `<br><span class="nome-parceiro">Comparsa: ${nomeParceiro}</span>`;
                document.getElementById('descricao-papel-revelacao').innerHTML =
                    desc;
            } else {
                document.getElementById(
                    'descricao-papel-revelacao',
                ).textContent = desc;
            }
            virador.classList.add('virado');
            ESTADO.jogo.revelacaoPapel.virado = true;
            instrucao.textContent = 'Toque de novo para esconder';
            ESTADO.jogo.revelacaoPapel.podeInteragir = false;
            await this._esperar(800);
            ESTADO.jogo.revelacaoPapel.podeInteragir = true;
        } else {
            virador.classList.remove('virado');
            ESTADO.jogo.revelacaoPapel.podeInteragir = false;
            await this._esperar(600);
            this.proximaRevelacao();
        }
    },

    proximaRevelacao() {
        const jogadores = ESTADO.slots.filter(Boolean);
        ESTADO.jogo.revelacaoPapel.indiceAtual++;
        if (ESTADO.jogo.revelacaoPapel.indiceAtual >= jogadores.length) {
            this.mostrarCarregamento();
        } else {
            this.renderizarTelaRevelacao();
        }
    },

    mostrarCarregamento() {
        if (ESTADO.devMode && ESTADO.devDireto) {
            console.log('⏩ DEV DIRETO: Pulando tela de carregamento.');
            this.iniciarIntroducao();
            return;
        }

        Visualizacao.fecharModal();
        this.irPara('carregamento');
        const contagem = ESTADO.slots.filter(Boolean).length;
        const ehM = ESTADO.jogo.modoMassacre;
        const ehC = ESTADO.jogo.modoCaos;
        const ehD = ESTADO.jogo.modoDoseDupla;
        let info = '';
        if (contagem <= 4) {
            const base = '<b>6</b> Reis, <b>6</b> Damas, <b>6</b> Ases';
            if (ehM) info = `${base}, <b>1</b> Coringa e <b>1</b> Valete.`;
            else if (ehC)
                info = `${base}, <b>1</b> Coringa e <b>1</b> Carta 8.`;
            else if (ehD)
                info = `${base}, <b>1</b> Coringa e <b>1</b> Carta 2.`;
            else info = `${base} e <b>2</b> Coringas.`;
        } else if (contagem === 5) {
            const base = '<b>7</b> Reis, <b>7</b> Damas, <b>7</b> Ases';
            if (ehM && ehC)
                info = `${base}, <b>1</b> Coringa, <b>1</b> Valete e <b>1</b> Carta 8.`;
            else if (ehM)
                info = `${base}, <b>2</b> Coringas e <b>1</b> Valete.`;
            else if (ehC)
                info = `${base}, <b>2</b> Coringas e <b>1</b> Carta 8.`;
            else if (ehD)
                info = `${base}, <b>2</b> Coringas e <b>1</b> Carta 2.`;
            else info = `${base} e <b>3</b> Coringas.`;
        } else if (contagem === 6) {
            const base = '<b>8</b> Reis, <b>8</b> Damas, <b>8</b> Ases';
            if (ehM && ehC)
                info = `${base}, <b>2</b> Coringas, <b>1</b> Valete e <b>1</b> Carta 8.`;
            else if (ehM)
                info = `${base}, <b>2</b> Coringas e <b>2</b> Valetes.`;
            else if (ehC)
                info = `${base}, <b>2</b> Coringas e <b>2</b> Cartas 8.`;
            else if (ehD)
                info = `${base}, <b>2</b> Coringas e <b>2</b> Cartas 2.`;
            else info = `${base} e <b>4</b> Coringas.`;
        } else if (contagem === 7) {
            // Regra do Usuário: 8K, 8Q, 8A, 2Cor e 9Esp (Total 35 cartas / 7 = 5 cada)
            info = `<b>8</b> Reis, <b>8</b> Damas, <b>8</b> Ases, <b>2</b> Coringas e <b>9</b> Especiais.`;
        }
        const infoBaralho = document.getElementById(
            'info-configuracao-baralho',
        );
        if (infoBaralho) infoBaralho.innerHTML = info;

        const btnPular = document.getElementById('btn-pular-carregamento');
        if (ESTADO.devMode) {
            btnPular.style.display = 'block';
        } else {
            btnPular.style.display = 'none';
        }

        setTimeout(() => {
            if (
                document
                    .getElementById('tela-carregamento')
                    .classList.contains('ativa')
            ) {
                this.iniciarIntroducao();
            }
        }, 4000);
    },

    iniciarIntroducao() {
        const nomesJogadores = ESTADO.slots.filter(Boolean);
        ESTADO.jogo.ativo = true;
        ESTADO.jogo.atirando = false;
        ESTADO.jogo.ehMassacre = false;
        ESTADO.jogo.indiceProtegido = null;
        ESTADO.jogo.ultimoIndiceProtegido = null;
        ESTADO.jogo.desbloqueiosRodada = [];
        ESTADO.jogo.trapaceiroNaMira = false;
        ESTADO.jogo.fraseTrapaceiroUsada = false;
        ESTADO.jogo.travamentoAtivado = false;
        ESTADO.jogo.caos = {
            ativo: false,
            fila: [],
            indiceEscolhaAtual: 0,
            alvos: {},
            votos: {},
            alvoDiabo: null,
        };
        ESTADO.jogo.historicoMesa = {
            piada: false,
            pare: false,
            reverso: false,
            morteComparsa: false,
            paciencia: false,
            ultimaChance: false,
            ricochete: false,
            trapaceiroRevelado: null, // Nome do trapaceiro revelado
            vitimaRicochete: null,    // Nome da vitima do ricochete
        };
        const perfisDisponiveis = Object.keys(CONFIGURACAO.perfis);
        for (let i = perfisDisponiveis.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [perfisDisponiveis[i], perfisDisponiveis[j]] = [
                perfisDisponiveis[j],
                perfisDisponiveis[i],
            ];
        }
        ESTADO.jogo.jogadores = nomesJogadores.map((nome, idx) => {
            const ehTrapaceiro = ESTADO.jogo.papeis[idx] === 'trapaceiro';
            return Logica.criarJogador(
                nome,
                perfisDisponiveis[idx % perfisDisponiveis.length],
                ehTrapaceiro
            );
        });
        ESTADO.jogo.indiceVez = Math.floor(
            Math.random() * nomesJogadores.length,
        );
        ESTADO.jogo.narrador = Logica.obterNarrador();
        ESTADO.jogo.cartaMesa = ['K', 'Q', 'A'][Math.floor(Math.random() * 3)];
        ESTADO.jogo.turnosMesa = 0;
        ESTADO.jogo.mesasCompletadas = 0;
        ESTADO.jogo.baralhoFrasesMorte = [...CONFIGURACAO.morte.frasesClique];
        Logica.embaralhar(ESTADO.jogo.baralhoFrasesMorte);
        ESTADO.jogo.indiceFraseMorte = 0;
        ESTADO.jogo.jogadores.forEach((p) => (p._temp = {}));
        this.executarAnimacaoRotacao(true);
    },

    async executarAnimacaoRotacao(ehIntroducao = false) {
        if (ESTADO.devMode && ESTADO.devDireto) {
            console.log('⏩ DEV DIRETO: Pulando animação de rotação.');
            this.iniciarTelaJogo();
            return;
        }

        this.irPara('rotacao');

        const btnPular = document.getElementById('btn-pular-rotacao');
        if (ESTADO.devMode) {
            btnPular.style.display = 'block';
        } else {
            btnPular.style.display = 'none';
        }

        if (ehIntroducao) SistemaAudio.tocar('introducao');
        else SistemaAudio.tocar('rotacao');
        const faceCarta = document.getElementById('frente-carta-rotacao');
        const nomeImagem =
            CONFIGURACAO.cartas[ESTADO.jogo.cartaMesa] || 'card-back.png';
        if (faceCarta)
            faceCarta.style.backgroundImage = `url('${CONFIGURACAO.caminhos.img}${nomeImagem}')`;
        const elementoNarrador = document.getElementById('narrador-rotacao');
        if (elementoNarrador) {
            if (ehIntroducao) {
                elementoNarrador.textContent =
                    CONFIGURACAO.narradores[ESTADO.jogo.narrador].introducao;
                document.getElementById('titulo-rotacao').textContent =
                    'A CARTA DA MESA É...';
            } else {
                const emojiNarrador =
                    this.obterEmoji(ESTADO.jogo.narrador) || '☠️';

                // NOVO: Lógica do Detetive (🕵️‍♂️) em Modo Trapaceiro
                if (ESTADO.jogo.modoTrapaceiro) {
                    const det = CONFIGURACAO.detetive;
                    const hist = ESTADO.jogo.historicoMesa;

                    // Prioridade: Ultima Chance > Paciencia > Morte Comparsa > Piada > Ricochete > Pare > Reverso > Calma
                    let tipoPista = 'calma';
                    let frase = '';

                    if (hist.ultimaChance && hist.trapaceiroRevelado) {
                        tipoPista = 'ultimaChance';
                        const frases = det.pistas[tipoPista];
                        frase = frases[Math.floor(Math.random() * frases.length)];
                        frase = frase.replace('{nome}', hist.trapaceiroRevelado);
                    } else if (hist.paciencia) {
                        tipoPista = 'paciencia';
                    } else if (hist.morteComparsa) {
                        tipoPista = 'morteComparsa';
                    } else if (hist.piada) {
                        tipoPista = 'piada';
                    } else if (hist.ricochete) {
                        tipoPista = 'ricochete';
                        const frases = det.pistas[tipoPista];
                        frase = frases[Math.floor(Math.random() * frases.length)];
                        frase = frase.replace('{vitima}', hist.vitimaRicochete || 'alguém');
                    } else if (hist.pare) {
                        tipoPista = 'pare';
                    } else if (hist.reverso) {
                        tipoPista = 'reverso';
                    }

                    if (!frase) {
                        const frases = det.pistas[tipoPista];
                        frase = frases[Math.floor(Math.random() * frases.length)];
                    }

                    elementoNarrador.textContent = `${CONFIGURACAO.emojis.especiais.Detetive} ${frase}`;

                    // NOVO: Persistir pistas para o botão interativo
                    this.gerarPistasRodada();

                    // Resetar histórico para a próxima mesa
                    ESTADO.jogo.historicoMesa = {
                        piada: false,
                        pare: false,
                        reverso: false,
                        morteComparsa: false,
                        paciencia: false,
                        ultimaChance: false,
                        ricochete: false,
                        trapaceiroRevelado: null,
                        vitimaRicochete: null,
                    };
                } else {
                    const linhaMesa =
                        (CONFIGURACAO.narradores[ESTADO.jogo.narrador]
                            .introducaoMesa || {})[ESTADO.jogo.cartaMesa] || '';

                    let mensagemExtra = '';
                    if (ESTADO.jogo.trapaceiroNaMira) {
                        mensagemExtra = ' Cheiro de trapaça no ar...';
                        ESTADO.jogo.trapaceiroNaMira = false;
                    }
                    if (
                        ESTADO.jogo.modoTrapaceiro &&
                        !ESTADO.jogo.fraseTrapaceiroUsada
                    ) {
                        mensagemExtra += ' Essa será minha maior vigarice 🎭';
                        ESTADO.jogo.fraseTrapaceiroUsada = true;
                    }
                    elementoNarrador.textContent = `${emojiNarrador} ${linhaMesa}${mensagemExtra}`;
                }
            }
        }
        const virador = document.getElementById('virador-carta');
        if (virador) {
            virador.classList.remove('animacao-virada');
            void virador.offsetWidth;
            virador.classList.add('animacao-virada');
            await this._esperar(6000);
            if (
                document
                    .getElementById('tela-rotacao')
                    .classList.contains('ativa')
            ) {
                virador.style.transform = 'rotateY(540deg)';
                this.iniciarTelaJogo();
            }
        }
    },

    pularEtapa(etapaAtual) {
        if (!ESTADO.devMode) return;
        console.log(`⏩ DEV PULAR: ${etapaAtual}`);

        if (etapaAtual === 'revelacao') {
            this.mostrarCarregamento();
        } else if (etapaAtual === 'carregamento') {
            this.iniciarIntroducao();
        } else if (etapaAtual === 'rotacao') {
            this.iniciarTelaJogo();
        }
    },

    async iniciarTelaJogo() {
        ESTADO.jogo.atirando = false;
        ESTADO.jogo.ehMassacre = false;
        this.modoDuelo = false;
        this.doseAtivo = false;
        ESTADO.jogo.caos.ativo = false;
        ESTADO.jogo.botoesBloqueados = true;

        document
            .getElementById('botao-alternar-duelo')
            .classList.remove('modo-ativo');
        document
            .getElementById('botao-alternar-caos')
            .classList.remove('modo-ativo');
        const botaoDose = document.getElementById('botao-alternar-dose');
        if (botaoDose) botaoDose.classList.remove('modo-ativo');

        ESTADO.jogo.vinganca = {
            ativo: false,
            indiceVingador: null,
        };

        const configuracaoAtual = Armazenamento.obter('configuracao');
        if (configuracaoAtual)
            ESTADO.jogo.modoTrapaceiro = configuracaoAtual.trapaceiro;

        this.irPara('jogo');
        this.atualizarInterfaceJogo();

        const delayNarrador = ESTADO.devMode && ESTADO.devDireto ? 0 : 2500;

        const narr = CONFIGURACAO.narradores[ESTADO.jogo.narrador];
        const emojiNarrador = this.obterEmoji(ESTADO.jogo.narrador) || '☠️';
        const linhaMesa =
            (narr.introducaoMesa || {})[ESTADO.jogo.cartaMesa] || '';

        this.atualizarStatus(emojiNarrador, linhaMesa);

        if (delayNarrador > 0) await this._esperar(delayNarrador);

        const nomeJogador = ESTADO.jogo.jogadores[ESTADO.jogo.indiceVez].nome;
        const fraseInicio = narr.jogadorInicia
            ? narr.jogadorInicia.replace('{nome}', nomeJogador)
            : `${nomeJogador}, você começa.`;

        this.atualizarStatus(emojiNarrador, fraseInicio);
        const infoIniciante = document.getElementById('info-iniciante');
        if (infoIniciante)
            infoIniciante.innerHTML = `★ <b>${nomeJogador}</b> começa essa bagaça`;

        if (delayNarrador > 0) await this._esperar(delayNarrador);

        this.atualizarStatus(null, null);
        ESTADO.jogo.botoesBloqueados = false;
        this.renderizarListaJogadores();
        this.renderizarPaineisLaterais();
    },

    async manipularTiro(indiceJogador) {
        if (this.doseAtivo && this.indiceJusticeiro !== null) {
            this.manipularAcaoDose(indiceJogador);
            return;
        }
        if (this.modoDuelo) {
            this.acionarMassacre(indiceJogador);
            return;
        }
        if (ESTADO.jogo.atirando || ESTADO.jogo.botoesBloqueados) return;

        ESTADO.jogo.atirando = true;
        ESTADO.jogo.vinganca.ativo = false;
        ESTADO.jogo.vinganca.indiceVingador = null;
        this.renderizarListaJogadores();

        const p = ESTADO.jogo.jogadores[indiceJogador];
        const indiceJogadorInt = parseInt(indiceJogador, 10);
        const ehTrapaceiro = this._ehTrapaceiro(indiceJogadorInt);

        if (p.emDesespero || p.contadorVirtual >= 6) {
            const categoria = p.contadorVirtual >= 6 ? 'nervoso' : 'desespero';
            const frasesDinamicas = CONFIGURACAO.perfis[p.perfil][categoria] || (categoria === 'nervoso' ? CONFIGURACAO.perfis[p.perfil].antes : ['Me ferrei...']);
            const frase = frasesDinamicas[p.falas.antes++ % frasesDinamicas.length];
            const emoji = categoria === 'nervoso' ? '😅' : '😱';
            this.atualizarStatus(emoji, frase);
            await this._esperar(this.TEMPOS.ANTES_TIRO);
        } else {
            const frases = CONFIGURACAO.perfis[p.perfil];
            const fraseAntes =
                frases.antes[p.falas.antes++ % frases.antes.length];
            const emoji = this.obterEmoji(p.perfil) || '';
            this.atualizarStatus(emoji, fraseAntes);
            await this._esperar(this.TEMPOS.ANTES_TIRO);
        }


        SistemaAudio.tocar('engatilhar');
        await this._esperar(this.TEMPOS.ENGATILHAR + this.TEMPOS.ATRASO_TIRO);

        let ehMorte = false;

        if (ehTrapaceiro || p.papel === 'justiceiro') {
            const emFrenesi = p.contadorVirtual >= 8;
            const tiroFatalReal = p.arma.contador === p.arma.bala;

            if (emFrenesi || tiroFatalReal) {
                // HIERARQUIA CONTRA SI MESMO (Art 7.1 e Art 8.1)

                // 1. FRENESI (🔥): Morte Imediata Absoluta no Disparo Manual
                if (emFrenesi) {
                    ehMorte = true;
                    console.log(`🔥 ${p.nome}: Frenesi causou auto-disparo fatal (Disparo Manual)!`);
                }
                // 2. PIADA (😂): Consome Piada do Justiceiro alvo de si mesmo
                else if (p.papel === 'justiceiro' && !p._habilidadesUsadas.piada) {
                    p._habilidadesUsadas.piada = true;
                    ESTADO.jogo.historicoMesa.piada = true;
                    ehMorte = false;
                    console.log(`😂 ${p.nome}: Piada ativada contra si mesmo (Art 7.1)!`);
                }
                // 3. ILUSÃO (🎭): Reset real da arma se for Justiceiro
                else if (p.papel === 'justiceiro' && !p._habilidadesUsadas.ilusao) {
                    p.arma.contador = 0;
                    p.arma.bala = Math.floor(Math.random() * 6);
                    p._habilidadesUsadas.ilusao = true;
                    ESTADO.jogo.historicoMesa.ilusao = true;
                    ehMorte = false;
                    console.log(`🎭 ${p.nome}: Ilusão ativada contra si mesmo (Art 7.1)!`);
                }
                // 4. REVERSO (🔄)
                else if (!p.reversoUsado) {
                    if (p.arma.contador > 0) {
                        p.arma.contador = p.arma.contador - 3;
                    } else {
                        p.arma.bala = (p.arma.bala + 1) % 6;
                        p.arma.contador = -1;
                    }
                    p.reversoUsado = true;
                    ESTADO.jogo.historicoMesa.reverso = true;
                    ehMorte = false;
                    console.log(`🔄 ${p.nome}: Reverso ativado!`);
                }
                // 5. PARE (🚫)
                else if (!p._habilidadesUsadas.pare && p.contadorVirtual < 7 && !p.emDesespero) {
                    p._habilidadesUsadas.pare = true;
                    ESTADO.jogo.historicoMesa.pare = true;
                    ehMorte = false;
                    armaTravou = true;
                    console.log(`🚫 ${p.nome}: Pare ativado contra si mesmo!`);
                }
                else {
                    ehMorte = true;
                }
            } else {
                ehMorte = false;
            }
        } else {
            ehMorte = p.arma.contador === p.arma.bala;
        }

        SistemaAudio.tocar(ehMorte ? 'tiro' : 'vazio');

        p.arma.contador++;
        p.contadorVirtual++;

        if (p.contadorVirtual === 6) {
            console.log(`😅 ${p.nome}: Parece Nervoso!`);
        }

        if (p.contadorVirtual >= 5 && !p.emDesespero) {
            p.emDesespero = true;
            console.log(`😱 ${p.nome}: Entrou em Desespero!`);
        }

        if (!ehTrapaceiro && p.arma.contador > 5) {
            Logica.resetarArma(p);
            p.contadorVirtual = 0;
        } else if (ehTrapaceiro && p.arma.contador > 5) {
            p.arma.contador = 0;
        }

        if (ehMorte) {
            if (ehTrapaceiro) p._mortesNaMesa++; // Ponto 2: Quebra paciência
            this.atualizarStatus('💥', 'POW!');
            document.body.classList.add('tremer-tela');
            setTimeout(
                () => document.body.classList.remove('tremer-tela'),
                500,
            );

            p.vivo = false;
            console.log(`☠️ ${p.nome}: Morreu!`);
            this.renderizarListaJogadores();

            if (!ESTADO.estatisticas[p.nome])
                ESTADO.estatisticas[p.nome] = {
                    vitorias: 0,
                    acertos: 0,
                    esquivas: 0,
                };
            ESTADO.estatisticas[p.nome].acertos++;
            ESTADO.estatisticas[p.nome]._meta = {
                ...ESTADO.estatisticas[p.nome]._meta,
                sequenciaMortes:
                    (ESTADO.estatisticas[p.nome]._meta?.sequenciaMortes || 0) +
                    1,
                sequenciaVitorias: 0,
            };
            Logica.verificarConquistas(
                p.nome,
                {
                    morreuNoTiro: p.contadorVirtual,
                },
                true,
            );

            await this._esperar(this.TEMPOS.LEITURA_RESULTADO + 1000);

            const narrConf = CONFIGURACAO.narradores[ESTADO.jogo.narrador];
            const mortePorPerfil =
                narrConf.frasesMorte && narrConf.frasesMorte[p.perfil]
                    ? narrConf.frasesMorte[p.perfil]
                    : narrConf.frasesMorte.padrao;
            const emojiNarrador = this.obterEmoji(ESTADO.jogo.narrador) || '☠️';
            this.atualizarStatus(emojiNarrador, mortePorPerfil);

            await this._esperar(this.TEMPOS.LEITURA_FALA);
            this.verificarFluxoJogo(indiceJogador);
        } else {
            this.atualizarStatus('💨', 'CLICK!');
            this.renderizarListaJogadores();

            await this._esperar(this.TEMPOS.LEITURA_RESULTADO);

            const camaraVisual = (p.contadorVirtual - 1) % 6;

            const podeVingar =
                ESTADO.jogo.modoTrapaceiro &&
                camaraVisual < 5 &&
                !p.emDesespero;

            if (podeVingar) {
                const iconeMorte = CONFIGURACAO.emojis.especiais.Morte;
                const fraseMorte =
                    ESTADO.jogo.baralhoFrasesMorte[
                    ESTADO.jogo.indiceFraseMorte %
                    ESTADO.jogo.baralhoFrasesMorte.length
                    ];
                ESTADO.jogo.indiceFraseMorte++;
                this.atualizarStatus(iconeMorte, fraseMorte);

                await this._esperar(this.TEMPOS.LEITURA_NARRADOR);

                ESTADO.jogo.vinganca.ativo = true;
                ESTADO.jogo.vinganca.indiceVingador = indiceJogadorInt;
                console.log(`👺 ${p.nome}: Tornou-se Vingador!`);

                const frases = CONFIGURACAO.perfis[p.perfil];
                const linhaVinganca =
                    frases.vinganca[
                    Math.floor(Math.random() * frases.vinganca.length)
                    ];
                this.atualizarStatus(this.obterEmoji(p.perfil), linhaVinganca);

                ESTADO.jogo.atirando = false;
                this.renderizarListaJogadores();
                return;
            }

            if (p.emDesespero || p.contadorVirtual >= 6) {
                const categoria = p.contadorVirtual >= 6 ? 'nervoso' : 'desespero';
                const frasesDinamicas = CONFIGURACAO.perfis[p.perfil][categoria] || ['Me ferrei, amigos e amigas...'];
                const indiceFrase = categoria === 'nervoso' ? p.falas.depoisSobreviver : p.falas.desespero;
                const fraseStatus = frasesDinamicas[indiceFrase % frasesDinamicas.length];

                if (categoria === 'nervoso') p.falas.depoisSobreviver++;
                else p.falas.desespero++;

                const emojiEstado = categoria === 'nervoso' ? '😅' : '😱';
                this.atualizarStatus(emojiEstado, fraseStatus);
            } else {
                const frases = CONFIGURACAO.perfis[p.perfil];
                const fraseDepois =
                    frases.depoisSobreviver[
                    p.falas.depoisSobreviver++ %
                    frases.depoisSobreviver.length
                    ];
                this.atualizarStatus(this.obterEmoji(p.perfil), fraseDepois);
            }

            if (!ESTADO.estatisticas[p.nome])
                ESTADO.estatisticas[p.nome] = {
                    vitorias: 0,
                    acertos: 0,
                    esquivas: 0,
                };
            ESTADO.estatisticas[p.nome].esquivas++;
            Logica.verificarConquistas(
                p.nome,
                {
                    esquivouUltimoTiroAntes:
                        p.arma.contador === 6 || p.arma.contador === 5,
                },
                true,
            );

            await this.finalizarVezNormal(indiceJogador);
        }
    },

    async finalizarVezNormal(indiceJogador) {
        await this._esperar(this.TEMPOS.LEITURA_FALA);
        this.atualizarStatus(null, null);
        ESTADO.jogo.atirando = false;
        this.verificarFluxoJogo(indiceJogador);
    },

    async manipularVingancaPassar() {
        if (ESTADO.jogo.atirando) return;
        ESTADO.jogo.atirando = true;
        this.renderizarListaJogadores();

        const indice = ESTADO.jogo.vinganca.indiceVingador;
        const vingador = ESTADO.jogo.jogadores[indice];
        const emoji = this.obterEmoji(vingador.perfil) || '';

        const frasesPassar = CONFIGURACAO.perfis[vingador.perfil].passarVez || [
            'Vou deixar pra próxima...',
        ];
        const linhaPassar =
            frasesPassar[Math.floor(Math.random() * frasesPassar.length)];

        let emojiStatus = emoji;
        if (vingador.emDesespero || vingador.contadorVirtual >= 6) {
            emojiStatus = vingador.contadorVirtual >= 6 ? '😅' : '😱';
        }

        this.atualizarStatus(emojiStatus, linhaPassar);

        await this._esperar(this.TEMPOS.LEITURA_FALA);

        ESTADO.jogo.vinganca.ativo = false;
        ESTADO.jogo.vinganca.indiceVingador = null;

        await this.finalizarVezNormal(indice);
    },

    async manipularTiroVinganca(indiceAlvo) {
        if (ESTADO.jogo.atirando) return;
        ESTADO.jogo.atirando = true;
        this.renderizarListaJogadores();

        const indiceVingador = ESTADO.jogo.vinganca.indiceVingador;
        const vingador = ESTADO.jogo.jogadores[indiceVingador];
        const alvo = ESTADO.jogo.jogadores[indiceAlvo];

        const ehVingadorTrapaceiro = this._ehTrapaceiro(indiceVingador);
        const ehAlvoTrapaceiro = this._ehTrapaceiro(indiceAlvo);

        if (vingador.emDesespero) {
            const frasesDesespero = CONFIGURACAO.perfis[vingador.perfil]
                .desespero || ['Me ferrei, amigos e amigas...'];
            const fraseDesespero =
                frasesDesespero[
                vingador.falas.desespero++ % frasesDesespero.length
                ];

            const emojiEstado = vingador.contadorVirtual >= 6 ? '😅' : '😱';
            this.atualizarStatus(emojiEstado, fraseDesespero);
            await this._esperar(this.TEMPOS.LEITURA_FALA);
            ESTADO.jogo.vinganca.ativo = false;
            ESTADO.jogo.vinganca.indiceVingador = null;
            this.finalizarVezNormal(indiceVingador);
            return;
        }

        SistemaAudio.tocar('engatilhar');
        await this._esperar(this.TEMPOS.ENGATILHAR + this.TEMPOS.ATRASO_TIRO);

        let ehMorte = false;
        let armaTravou = false;

        // 1. Predição de Morte (Antes dos incrementos)
        const vingadorEmFrenesi = ehVingadorTrapaceiro && vingador.contadorVirtual >= 8;
        let ehMorteOriginal = false;

        if (vingadorEmFrenesi) {
            ehMorteOriginal = true;
        } else if (ehVingadorTrapaceiro) {
            ehMorteOriginal = this._verificarMortePotencialTrapaceiro(vingador);
        } else {
            ehMorteOriginal = (vingador.arma.contador === vingador.arma.bala);
        }

        // 2. Aplicação de Defesas (Hierárquico: Frenesi > Piada > Vigarice > Pare)
        const resultadoDefesa = this._processarDefesasHierarquicas(vingador, alvo, 'vingador', ehMorteOriginal);
        ehMorte = resultadoDefesa.ehMorte;
        armaTravou = resultadoDefesa.armaTravou;

        // 3. Execução dos Incrementos
        if (ehVingadorTrapaceiro) {
            this._incrementarArmasTrapaceiro(vingador, armaTravou);
            if (ehMorte) vingador._mortesNaMesa++; // Estatística para Paciência
        } else {
            // Inocente só incrementa contador real se a arma não travou (Art 15)
            if (!armaTravou) {
                vingador.arma.contador++;
            }
            vingador.contadorVirtual++;

            if (vingador.arma.contador > 5) {
                vingador.arma.contador = 0;
            }
        }

        // 4. Perda de Arma Especial se matar QUALQUER UM (Art 1.2)
        if (ehMorte && vingador.armaPassivaTipo === 'especial') {
            vingador.armaPassivaTipo = 'normal';
            vingador.arma.bala = Math.floor(Math.random() * 6);
            vingador.arma.contador = 0;
            vingador.armaAtaque.contador = 0;
            vingador.contadorVirtual = 0;
            console.log(`🔫 ${vingador.nome}: Matou alguém → Perdeu Arma Especial`);
        }

        SistemaAudio.tocar(ehMorte ? 'tiro' : 'vazio');
        ESTADO.jogo.vinganca.ativo = false;
        ESTADO.jogo.vinganca.indiceVingador = null;

        if (ehMorte) {
            alvo.vivo = false;
            console.log(`☠️ ${alvo.nome}: Morreu (por vingança)!`);
            alvo.contadorVirtual++;

            this.atualizarStatus('💥', 'POW!');
            this.renderizarListaJogadores();
            this.renderizarPaineisLaterais();
            document.body.classList.add('tremer-tela');
            setTimeout(
                () => document.body.classList.remove('tremer-tela'),
                500,
            );

            Logica.resetarArma(vingador);

            if (ehVingadorTrapaceiro) {
                Logica.resetarArma(vingador, 'letal');
            }

            if (!ESTADO.estatisticas[alvo.nome])
                ESTADO.estatisticas[alvo.nome] = {
                    vitorias: 0,
                    acertos: 0,
                    esquivas: 0,
                };
            ESTADO.estatisticas[alvo.nome].acertos++;
            Logica.verificarConquistas(
                alvo.nome,
                { morreuNoTiro: alvo.contadorVirtual },
                true,
            );

            await this._esperar(this.TEMPOS.LEITURA_RESULTADO);

            const narrConf = CONFIGURACAO.narradores[ESTADO.jogo.narrador];
            const mortePorPerfil =
                narrConf.frasesMorte && narrConf.frasesMorte[alvo.perfil]
                    ? narrConf.frasesMorte[alvo.perfil]
                    : narrConf.frasesMorte.padrao;
            const emojiNarrador = this.obterEmoji(ESTADO.jogo.narrador) || '☠️';
            this.atualizarStatus(emojiNarrador, mortePorPerfil);

            await this._esperar(this.TEMPOS.LEITURA_FALA);
            this.verificarFluxoJogo(indiceVingador);
        } else {
            // Apenas feedback genérico (não revela habilidades)
            this.atualizarStatus('💨', 'CLICK!');

            // NOVO: Reset da arma letal no final do turno (Art 2.1)
            // EXCETO em Piada, ou quando Justiceiro atira em si e sobrevive (Art 2.1)
            // Adaptação para manipularTiroVinganca:
            // - 'p' se torna 'vingador'
            // - 'ehTrapaceiro' se torna 'ehVingadorTrapaceiro'
            // - 'tiroFatalReal' e 'emFrenesi' não são diretamente aplicáveis aqui,
            //   mas a lógica de "Justiceiro atira em si e sobrevive" não se aplica a vingança,
            //   pois vingança é sempre contra outro jogador.
            //   A condição original para 'manipularTiro' era:
            //   `const justiceiroSobreviveuSi = p.papel === 'justiceiro' && (tiroFatalReal || emFrenesi);`
            //   Como vingança não é auto-disparo, esta parte da condição é removida.
            //   Apenas a parte de 'Piada' (ehAlvoTrapaceiro) e 'Pare' (resultadoDefesa.tipoAtivado) é relevante.
            if (ehVingadorTrapaceiro && !ehAlvoTrapaceiro && resultadoDefesa?.tipoAtivado !== 'pare') {
                Logica.resetarArma(vingador, 'letal');
                console.log(`🧹 Dev: ${vingador.nome} arma letal resetada (Fim de turno).`);
            }

            this.renderizarListaJogadores();
            await this._esperar(this.TEMPOS.LEITURA_RESULTADO);

            const tFrases = CONFIGURACAO.perfis[alvo.perfil];
            const tFrase =
                tFrases.depoisSobreviver[
                alvo.falas.depoisSobreviver++ %
                tFrases.depoisSobreviver.length
                ];
            const tEmoji = this.obterEmoji(alvo.perfil);
            this.atualizarStatus(tEmoji, tFrase);

            await this.finalizarVezNormal(indiceVingador);
        }
    },

    verificarFluxoJogo(ultimoAtiradorIndice) {
        // Centralizado: Incrementar tiros na mesa a cada fim de ação/turno
        ESTADO.jogo.turnosMesa++;

        const vivos = ESTADO.jogo.jogadores.filter((p) => p.vivo);
        let jogoAcabou = false;
        let vencedores = [];
        let tituloVitoria = '';
        let mensagemVitoria = '';

        if (ESTADO.jogo.modoTrapaceiro) {
            const todosTrapaceiros = ESTADO.jogo.jogadores.filter(
                (p, i) => ESTADO.jogo.papeis[i] === 'trapaceiro',
            );
            const todosInocentes = ESTADO.jogo.jogadores.filter(
                (p, i) => ESTADO.jogo.papeis[i] === 'jogador',
            );
            const trapaceirosVivos = todosTrapaceiros.filter((p) => p.vivo);
            const inocentesVivos = todosInocentes.filter((p) => p.vivo);

            if (trapaceirosVivos.length === 0 && inocentesVivos.length > 0) {
                jogoAcabou = true;
                vencedores = todosInocentes;
                tituloVitoria = 'OS JOGADORES VENCERAM';
                const narradorConfig =
                    CONFIGURACAO.narradores[ESTADO.jogo.narrador];
                mensagemVitoria =
                    narradorConfig?.vitoriaVingadores || 'O bar foi limpo.';
            } else if (
                inocentesVivos.length === 0 &&
                trapaceirosVivos.length > 0
            ) {
                jogoAcabou = true;
                vencedores = todosTrapaceiros;
                tituloVitoria = 'OS TRAPACEIROS VENCERAM';
                const narradorConfig =
                    CONFIGURACAO.narradores[ESTADO.jogo.narrador];
                mensagemVitoria =
                    narradorConfig?.vitoriaTrapaceiros ||
                    'Questione meus métodos, mas não meus resultados.';
            } else if (vivos.length <= 1) {
                jogoAcabou = true;
                if (vivos.length === 1) {
                    const papel =
                        ESTADO.jogo.papeis[
                        ESTADO.jogo.jogadores.indexOf(vivos[0])
                        ];
                    if (papel === 'trapaceiro') {
                        vencedores = todosTrapaceiros;
                        tituloVitoria = 'OS TRAPACEIROS VENCERAM';
                        const narradorConfig =
                            CONFIGURACAO.narradores[ESTADO.jogo.narrador];
                        mensagemVitoria =
                            narradorConfig?.vitoriaTrapaceiros ||
                            'Questione meus métodos, mas não meus resultados.';
                    } else {
                        vencedores = todosInocentes;
                        tituloVitoria = 'OS JOGADORES VENCERAM';
                        const narradorConfig =
                            CONFIGURACAO.narradores[ESTADO.jogo.narrador];
                        mensagemVitoria =
                            narradorConfig?.vitoriaVingadores ||
                            'O bar foi limpo.';
                    }
                } else {
                    tituloVitoria = 'SEM VENCEDORES';
                    mensagemVitoria =
                        CONFIGURACAO.diabo.resultados.todosMortos[0] ||
                        'TODOS MORRERAM! O BAR É MEU! HAHAHAHA! 😈🔥';
                }
            }
        } else {
            if (vivos.length <= 1) {
                jogoAcabou = true;
                if (vivos.length === 1) {
                    vencedores = vivos;
                    tituloVitoria = 'VENCEDOR!';
                    mensagemVitoria = `${vencedores[0].nome} venceu!`;
                } else {
                    tituloVitoria = 'SEM VENCEDORES';
                    mensagemVitoria =
                        CONFIGURACAO.diabo.resultados.todosMortos[0] ||
                        'Ninguém sobrou nessa mesa maldita.';
                }
            }
        }

        if (jogoAcabou) {
            ESTADO.jogo.ativo = false;

            vencedores.forEach((v) => {
                if (!ESTADO.estatisticas[v.nome])
                    ESTADO.estatisticas[v.nome] = {
                        vitorias: 0,
                        acertos: 0,
                        esquivas: 0,
                        partidas: 0,
                    };
                ESTADO.estatisticas[v.nome].vitorias++;
                const meta = ESTADO.estatisticas[v.nome]._meta || {};
                ESTADO.estatisticas[v.nome]._meta = {
                    ...meta,
                    sequenciaVitorias: (meta.sequenciaVitorias || 0) + 1,
                    sequenciaMortes: 0,
                };
                Logica.verificarConquistas(
                    v.nome,
                    {
                        sequenciaVitorias:
                            ESTADO.estatisticas[v.nome]._meta.sequenciaVitorias,
                    },
                    true,
                );
            });

            ESTADO.jogo.jogadores.forEach((p) => {
                if (!ESTADO.estatisticas[p.nome])
                    ESTADO.estatisticas[p.nome] = {
                        vitorias: 0,
                        acertos: 0,
                        esquivas: 0,
                        partidas: 0,
                    };
                ESTADO.estatisticas[p.nome].partidas =
                    (ESTADO.estatisticas[p.nome].partidas || 0) + 1;
            });

            const tituloVitoriaEl = document.querySelector('#tela-vitoria h1');
            if (tituloVitoriaEl) tituloVitoriaEl.textContent = tituloVitoria;

            const mensagemVitoriaEl =
                document.getElementById('mensagem-vitoria');
            if (mensagemVitoriaEl) {
                let html = '';

                if (
                    ESTADO.jogo.modoTrapaceiro &&
                    ESTADO.jogo.narrador &&
                    vencedores.length > 0
                ) {
                    const emojiNarrador =
                        CONFIGURACAO.emojis.narradores[ESTADO.jogo.narrador];
                    html += `<div style="font-size:2rem; margin-bottom:8px;">${emojiNarrador}</div>`;
                } else if (vencedores.length === 0) {
                    html += `<div style="font-size:2rem; margin-bottom:8px;">😈</div>`;
                }

                html += `<div style="font-style:italic; font-size:1.1rem; margin-bottom:12px;">"${mensagemVitoria}"</div>`;

                if (vencedores.length > 0) {
                    html += `<br><div class="rotulo-vencedor">Vencedores:</div>`;
                    html += `<div class="lista-vencedores">`;
                    vencedores.forEach((v) => {
                        const iconeStatus = v.vivo ? '' : '💀';
                        html += `<span class="item-vencedor">${v.nome} ${iconeStatus}</span>`;
                    });
                    html += `</div>`;
                }
                mensagemVitoriaEl.innerHTML = html;
            }

            const divConquistas = document.getElementById('conquistas-vitoria');
            if (divConquistas) {
                divConquistas.innerHTML = '';
                if (ESTADO.jogo.desbloqueiosRodada.length > 0) {
                    divConquistas.innerHTML =
                        '<p style="font-weight:bold; margin:10px 0 5px 0;">🏆 Conquistas Desbloqueadas:</p>';
                    ESTADO.jogo.desbloqueiosRodada.forEach((id) => {
                        const def = DEFINICOES_CONQUISTAS.find(
                            (a) => a.id === id,
                        );
                        if (def) {
                            divConquistas.innerHTML += `
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:6px; background:rgba(255,215,0,0.1); border-radius:4px;">
                                    <span style="font-size:1.5rem;">${def.emoji}</span>
                                    <div style="flex:1;">
                                        <div style="font-weight:bold; color:var(--ouro);">${def.nome}</div>
                                        <div style="font-size:0.8rem; opacity:0.8;">${def.descricao}</div>
                                    </div>
                                </div>
                            `;
                        }
                    });
                }
            }

            Armazenamento.definir('estatisticas', ESTADO.estatisticas);
            ESTADO.jogo.atirando = false;
            setTimeout(() => {
                this.irPara('vitoria');
            }, 1000);
            return;
        }

        ESTADO.jogo.atirando = false;
        if (Logica.rotacionarMesa()) {
            // Gerar pistas ANTES da rotação (para capturar histórico da mesa que está encerrando)
            if (ESTADO.jogo.modoTrapaceiro) {
                this.gerarPistasRodada();
            }
            this.executarAnimacaoRotacao(false);
            this.definirProximaVez(ultimoAtiradorIndice);
        } else {
            this.definirProximaVez(ultimoAtiradorIndice);
            this.atualizarInterfaceJogo();
        }
    },

    definirProximaVez(indiceAtual) {
        let indiceReal = parseInt(indiceAtual, 10);
        if (isNaN(indiceReal)) indiceReal = ESTADO.jogo.indiceVez;

        let proximo = (indiceReal + 1) % ESTADO.jogo.jogadores.length;
        while (!ESTADO.jogo.jogadores[proximo].vivo)
            proximo = (proximo + 1) % ESTADO.jogo.jogadores.length;
        ESTADO.jogo.indiceVez = proximo;
    },

    reiniciarJogo() {
        if (ESTADO.jogo.modoTrapaceiro) {
            this.atribuirPapeis();
            this.iniciarRevelacaoPapel();
        } else {
            this.mostrarCarregamento();
        }
    },

    gerarPistasRodada() {
        const det = CONFIGURACAO.detetive;
        const hist = ESTADO.jogo.historicoMesa;
        const pistas = [];

        if (hist.ultimaChance && hist.trapaceiroRevelado) {
            const f = det.pistas.ultimaChance[Math.floor(Math.random() * det.pistas.ultimaChance.length)];
            pistas.push(f.replace('{nome}', hist.trapaceiroRevelado));
        }
        if (hist.paciencia) pistas.push(det.pistas.paciencia[0]);
        if (hist.morteComparsa) {
            const f = det.pistas.morteComparsa[Math.floor(Math.random() * det.pistas.morteComparsa.length)];
            pistas.push(f);
        }
        if (hist.piada) {
            const f = det.pistas.piada[Math.floor(Math.random() * det.pistas.piada.length)];
            pistas.push(f);
        }
        if (hist.ricochete) {
            const f = det.pistas.ricochete[Math.floor(Math.random() * det.pistas.ricochete.length)];
            pistas.push(f.replace('{vitima}', hist.vitimaRicochete || 'alguém'));
        }
        if (hist.pare) {
            const f = det.pistas.pare[Math.floor(Math.random() * det.pistas.pare.length)];
            pistas.push(f);
        }
        if (hist.reverso) {
            const f = det.pistas.reverso[Math.floor(Math.random() * det.pistas.reverso.length)];
            pistas.push(f);
        }

        // Se não houve nada, uma pista de "calma"
        if (pistas.length === 0) {
            pistas.push(det.pistas.calma[Math.floor(Math.random() * det.pistas.calma.length)]);
        }

        ESTADO.jogo.cluesAnteriores = pistas;
    },

    async pedirPistasDetetive() {
        if (ESTADO.jogo.emFalaDetetive || ESTADO.jogo.atirando) return;

        ESTADO.jogo.emFalaDetetive = true;
        const det = CONFIGURACAO.detetive;
        const clues = ESTADO.jogo.cluesAnteriores;

        // Fluxo: Pista1 > Complexo1 > Pista2 (se houver) > Bobo1 (se houver Pista2) > Pista3 (se houver) > Complexo2 (se houver Pista3)

        const falar = async (txt) => {
            this.atualizarStatus(CONFIGURACAO.emojis.especiais.Detetive, txt);
            await this._esperar(this.TEMPOS.LEITURA_FALA + 500);
        };

        try {
            // Verificar se há pistas disponíveis
            if (!clues || clues.length === 0) {
                await falar("Ainda não tenho informações suficientes sobre esta mesa.");
                return;
            }

            // 1. Pista 1 (Sempre tem ao menos uma gerada por gerarPistasRodada)
            await falar(clues[0]);

            // 2. Complexo 1
            const complexo1 = det.pistas.complexo[Math.floor(Math.random() * det.pistas.complexo.length)];
            await falar(complexo1);

            // 3. Pista 2?
            if (clues.length > 1) {
                await falar(clues[1]);

                // 4. Bobo 1
                const bobo1 = det.pistas.bobo[Math.floor(Math.random() * det.pistas.bobo.length)];
                await falar(bobo1);

                // 5. Pista 3?
                if (clues.length > 2) {
                    await falar(clues[2]);

                    // 6. Complexo 2
                    const restosComplexo = det.pistas.complexo.filter(c => c !== complexo1);
                    const complexo2 = restosComplexo[Math.floor(Math.random() * restosComplexo.length)] || complexo1;
                    await falar(complexo2);
                }
            } else {
                // Se não tem Pista 2, o detetive diz que ainda precisa investigar mais
                await falar("Meus arquivos estão incompletos... Preciso de mais observações factuais.");
            }
        } finally {
            await this._esperar(this.TEMPOS.LEITURA_FALA);
            this.atualizarStatus(null, null);
            ESTADO.jogo.emFalaDetetive = false;
        }
    },
};
