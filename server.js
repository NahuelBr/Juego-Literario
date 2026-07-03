const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const PATH_DATOS = path.join(__dirname, 'datos.json');
const PATH_USUARIOS = path.join(__dirname, 'usuarios.json');

// Auxiliar para leer JSONs de forma segura
const leerJSON = (ruta) => JSON.parse(fs.readFileSync(ruta, 'utf8'));
const escribirJSON = (ruta, datos) => fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));

// RUTA: Obtener preguntas del juego
app.get('/api/juego', (req, res) => {
    try {
        res.json(leerJSON(PATH_DATOS));
    } catch (e) {
        res.status(500).json({ error: 'Error al cargar datos' });
    }
});

// RUTA: Registro de usuarios
app.post('/api/registro', (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: 'Faltan datos' });

    const usuarios = leerJSON(PATH_USUARIOS);
    const existe = usuarios.find(u => u.usuario.toLowerCase() === usuario.toLowerCase());
    
    if (existe) return res.status(400).json({ error: 'El usuario ya existe' });

    usuarios.push({ usuario, password, puntos: 0 });
    escribirJSON(PATH_USUARIOS, usuarios);
    res.json({ success: true, mensaje: 'Usuario creado exitosamente' });
});

// RUTA: Login de usuarios
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    const usuarios = leerJSON(PATH_USUARIOS);
    const user = usuarios.find(u => u.usuario.toLowerCase() === usuario.toLowerCase() && u.password === password);

    if (!user) return res.status(400).json({ error: 'Credenciales incorrectas' });
    res.json({ success: true, usuario: user.usuario, puntos: user.puntos });
});

// RUTA: Sumar puntos de forma segura sin repetir preguntas
app.post('/api/sumar-puntos', (req, res) => {
    const { usuario, preguntaId } = req.body;
    const usuarios = leerJSON(PATH_USUARIOS);
    const user = usuarios.find(u => u.usuario === usuario);

    if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si el usuario no tiene la lista creada todavía, se la creamos
    if (!user.preguntasRespondidas) {
        user.preguntasRespondidas = [];
    }

    // CONTROL DE TRAMPAS: Ver si ya respondió este ID de pregunta antes
    if (user.preguntasRespondidas.includes(preguntaId)) {
        return res.json({ success: false, mensaje: 'Ya ganaste puntos con esta pregunta.', nuevosPuntos: user.puntos });
    }

    // Calcular puntos de forma segura en el servidor
    let puntosASumar = 0;
    if (typeof preguntaId === 'string') {
        if (preguntaId.startsWith('completar_')) {
            const idx = parseInt(preguntaId.split('_')[1], 10);
            const datos = leerJSON(PATH_DATOS);
            if (!isNaN(idx) && idx >= 0 && idx < datos.completar_palabras.length) {
                puntosASumar = 10;
            } else {
                return res.status(400).json({ error: 'ID de pregunta completar fuera de rango o inválido' });
            }
        } else if (preguntaId.startsWith('sopa_')) {
            const parts = preguntaId.split('_').slice(1);
            if (parts.length > 0) {
                const datos = leerJSON(PATH_DATOS);
                const todasValidas = parts.every(pal => 
                    datos.sopa_letras.some(s => s.palabra.toUpperCase() === pal.toUpperCase())
                );
                if (todasValidas) {
                    puntosASumar = 50;
                } else {
                    return res.status(400).json({ error: 'ID de sopa contiene palabras inválidas' });
                }
            } else {
                return res.status(400).json({ error: 'Formato de ID de sopa inválido' });
            }
        } else {
            return res.status(400).json({ error: 'ID de pregunta no válido' });
        }
    } else if (typeof preguntaId === 'number') {
        // Soporte retrospectivo
        puntosASumar = 10;
    } else {
        return res.status(400).json({ error: 'ID de pregunta inválido' });
    }

    // Si es nueva, le sumamos los puntos y guardamos el ID de la pregunta
    user.puntos += puntosASumar;
    user.preguntasRespondidas.push(preguntaId);
    
    escribirJSON(PATH_USUARIOS, usuarios);
    return res.json({ success: true, nuevosPuntos: user.puntos });
});
// RUTA: Obtener Top 5 para el Ranking
app.get('/api/ranking', (req, res) => {
    const usuarios = leerJSON(PATH_USUARIOS);
    // Ordenar de mayor a menor puntaje y sacar los mejores 5
    const ranking = usuarios
        .sort((a, b) => b.puntos - a.puntos)
        .map(u => ({ usuario: u.usuario, puntos: u.puntos }))
        .slice(0, 5);
    res.json(ranking);
});

// RUTA: Verificar completar palabras
app.post('/api/verificar-completar', (req, res) => {
    const { id, respuestaUsuario, pedirPista } = req.body;
    const datos = leerJSON(PATH_DATOS);
    const item = datos.completar_palabras[id];
    
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    if (pedirPista) return res.json({ pista: item.pista });
    
    const esCorrecto = item.respuesta.toLowerCase() === respuestaUsuario.trim().toLowerCase();
    res.json({ correcto: esCorrecto });
});

app.listen(PORT, () => {
    console.log(`Servidor con Login y Ranking en http://localhost:${PORT}`);
});
