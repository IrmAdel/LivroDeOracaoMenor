const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

// Cria as pastas se não existirem
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('data/secoes')) fs.mkdirSync('data/secoes', { recursive: true });

let dataBuffer = fs.readFileSync('shorter_PB.pdf'); // Nome do seu PDF

pdf(dataBuffer).then(function(data) {
    const textoBruto = data.text;
    
    // O PDF extraído tem muitas quebras de linha estranhas e números de página.
    // Vamos limpar um pouco o texto (você precisará refinar isso)
    let linhas = textoBruto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Vamos criar uma seção de exemplo (Você terá que fazer a lógica para dividir em seções reais)
    const blocos = [];
    let paginaAtual = 1;

    // Exemplo simples: transforma cada linha em um parágrafo de texto
    // ATENÇÃO: O PDF tem muito lixo (números 1 1 1 1, cabeçalhos repetidos). 
    // Você precisará criar regras (Regex) para ignorar essas linhas.
    linhas.forEach(linha => {
        // Ignora linhas que são apenas números (números de página vazados)
        if (/^[\d\s]+$/.test(linha)) return;
        
        // Cria um bloco no formato que o seu app.js espera
        blocos.push({
            tipo: "texto",
            pagina: paginaAtual,
            texto: linha
        });
    });

    // Cria o objeto da seção
    const secao = {
        id: "01-exemplo",
        titulo: "Texto Extraído do PDF",
        modo: "prosa",
        paginaInicial: 1,
        paginaFinal: 154, // Ajuste conforme o PDF
        blocos: blocos
    };

    // Salva o arquivo da seção
    fs.writeFileSync('data/secoes/01-exemplo.json', JSON.stringify(secao, null, 2));

    // Cria o índice
    const indice = [
        {
            id: "01-exemplo",
            titulo: "Texto Extraído do PDF",
            paginaInicial: 1,
            paginaFinal: 154
        }
    ];
    
    // O seu app.js lê 'data/indice.json' por padrão
    fs.writeFileSync('data/indice.json', JSON.stringify(indice, null, 2));

    console.log("Arquivos JSON gerados com sucesso na pasta data/!");
});
