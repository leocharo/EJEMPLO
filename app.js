import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, deleteField, increment, query, orderBy } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let listaGlobalAsignaturas = ['Español', 'Matemáticas', 'Ciencias'];

const firebaseConfig = {
    apiKey: "AIzaSyBdgXatY1zLKmkP4VDkvIz6xfzixDVNE5I",
    authDomain: "telesecundaria-aad6d.firebaseapp.com",
    projectId: "telesecundaria-aad6d",
    storageBucket: "telesecundaria-aad6d.firebasestorage.app",
    messagingSenderId: "406908968658",
    appId: "1:406908968658:web:f1ab69e45365ec04a7970b",
    measurementId: "G-H7WK2J3WVZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let usuarioActual = null;
let esAdmin = false;
let listaGlobalPublicaciones = [];
let listaGlobalExperiencias = [];
let filtroAsignaturaActual = 'Todas';
let modoAdminVisualizacion = false;

let comentariosCache = {};              
let panelesComentariosAbiertos = new Set(); 
let indicesCarrusel = {};

const convertirArchivoABase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

onAuthStateChanged(auth, async (user) => {
    const navContainer = document.getElementById('auth-nav-container');
    const adminContainer = document.getElementById('admin-toggle-container');
    const contenidoForo = document.getElementById('contenido-foro');
    const estadoNoAutenticado = document.getElementById('estado-no-autenticado');
    const avatarMuro = document.getElementById('avatar-usuario-muro');
    
    if (user) {
        if (!user.emailVerified) {
            await signOut(auth);
            window.location.href = 'inicio_sesion.html';
            return;
        }

        usuarioActual = user;

        try {
            const userDocSnap = await getDoc(doc(db, "usuarios", user.uid));
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                esAdmin = userData.rol === 'admin';
                
                if (userData.fotoUrl && avatarMuro) {
                    avatarMuro.innerHTML = `<img src="${userData.fotoUrl}" class="w-full h-full object-cover" alt="Perfil">`;
                }
            } else {
                esAdmin = false;
            }
        } catch (error) {
            esAdmin = false;
        }
        
        if (contenidoForo) contenidoForo.classList.remove('hidden');
        if (estadoNoAutenticado) estadoNoAutenticado.classList.add('hidden');

        if (navContainer) {
            navContainer.innerHTML = `
                <div class="flex items-center space-x-2">
                    <span class="text-[11px] bg-emerald-800 px-2.5 py-1 rounded-full text-emerald-100 hidden sm:inline-block">
                        ${esAdmin ? '👑 Docente / Admin' : '🎓 Estudiante'}
                    </span>
                    <a href="usuario_index.html" class="bg-[#2F6B4F] hover:opacity-90 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition">
                        Mi Perfil
                    </a>
                    <button onclick="cerrarSesion()" class="bg-[#1F3B2C] border border-[#C9D9CE] hover:bg-red-900 px-3 py-1.5 rounded-xl text-xs font-medium transition">
                        Salir
                    </button>
                </div>
            `;
        }

        if (adminContainer) {
            if (esAdmin) {
                adminContainer.classList.remove('hidden');
            } else {
                adminContainer.classList.add('hidden');
            }
        }

        await cargarAsignaturasDinamicas();
        cargarPublicaciones();
        cargarExperienciasPracticas();
    } else {
        usuarioActual = null;
        esAdmin = false;
        
        if (contenidoForo) contenidoForo.classList.add('hidden');
        if (estadoNoAutenticado) estadoNoAutenticado.classList.remove('hidden');
        if (adminContainer) adminContainer.classList.add('hidden');
        
        if (navContainer) {
            navContainer.innerHTML = `
                <a href="inicio_sesion.html" class="bg-white text-emerald-700 hover:bg-emerald-50 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium transition shadow-xs">
                    Iniciar Sesión
                </a>
            `;
        }
    }
});

window.mostrarNotificacion = function(mensaje, tipo = 'exito') {
    const contenedor = document.getElementById('contenedor-notificaciones');
    if (!contenedor) return;

    const notif = document.createElement('div');
    notif.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-lg text-xs md:text-sm font-medium text-white transition-all transform translate-y-2 opacity-0 flex items-center gap-2 ${
        tipo === 'error' ? 'bg-red-600' : 'bg-[#2F6B4F]'
    }`;
    
    notif.innerHTML = `
        <i class="fa-solid ${tipo === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
        <span>${mensaje}</span>
    `;

    contenedor.appendChild(notif);

    setTimeout(() => {
        notif.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        notif.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => notif.remove(), 300);
    }, 3500);
}

// Vistas previas y limpieza de archivos adjuntos
window.mostrarPreviewImagenes = function() {
    const input = document.getElementById('sub-imagen');
    const contenedor = document.getElementById('preview-imagenes-container');
    contenedor.innerHTML = '';
    if (input.files.length > 0) {
        contenedor.innerHTML = `
            <div class="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg text-xs border border-slate-200 w-full">
                <span class="truncate text-slate-700"><i class="fa-solid fa-images mr-1 text-emerald-700"></i> ${input.files.length} imagen(es) seleccionada(s)</span>
                <button type="button" onclick="quitarImagenes()" class="text-red-500 hover:text-red-700 font-bold ml-2 px-1"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }
}

window.quitarImagenes = function() {
    document.getElementById('sub-imagen').value = '';
    document.getElementById('preview-imagenes-container').innerHTML = '';
}

window.mostrarPreviewArchivo = function() {
    const input = document.getElementById('sub-archivo');
    const contenedor = document.getElementById('preview-archivo-container');
    contenedor.innerHTML = '';
    if (input.files[0]) {
        contenedor.innerHTML = `
            <div class="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg text-xs border border-slate-200 w-full">
                <span class="truncate text-slate-700"><i class="fa-solid fa-file-pdf mr-1 text-emerald-700"></i> ${input.files[0].name}</span>
                <button type="button" onclick="quitarArchivo()" class="text-red-500 hover:text-red-700 font-bold ml-2 px-1"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }
}

window.quitarArchivo = function() {
    document.getElementById('sub-archivo').value = '';
    document.getElementById('preview-archivo-container').innerHTML = '';
}

window.mostrarPreviewFotosExp = function() {
    const input = document.getElementById('input-media-foto');
    const contenedor = document.getElementById('preview-fotos-exp-container');
    contenedor.innerHTML = '';
    if (input.files.length > 0) {
        contenedor.innerHTML = `
            <div class="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg text-xs border border-slate-200 w-full">
                <span class="truncate text-slate-700"><i class="fa-solid fa-images mr-1 text-emerald-700"></i> ${input.files.length} foto(s) seleccionada(s)</span>
                <button type="button" onclick="quitarFotosExp()" class="text-red-500 hover:text-red-700 font-bold ml-2 px-1"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }
}

window.quitarFotosExp = function() {
    document.getElementById('input-media-foto').value = '';
    document.getElementById('preview-fotos-exp-container').innerHTML = '';
}

window.mostrarPreviewVideoExp = function() {
    const input = document.getElementById('input-media-video');
    const contenedor = document.getElementById('preview-video-exp-container');
    contenedor.innerHTML = '';
    if (input.files[0]) {
        contenedor.innerHTML = `
            <div class="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg text-xs border border-slate-200 w-full">
                <span class="truncate text-slate-700"><i class="fa-solid fa-video mr-1 text-emerald-700"></i> ${input.files[0].name}</span>
                <button type="button" onclick="quitarVideoExp()" class="text-red-500 hover:text-red-700 font-bold ml-2 px-1"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }
}

window.quitarVideoExp = function() {
    document.getElementById('input-media-video').value = '';
    document.getElementById('preview-video-exp-container').innerHTML = '';
}

window.abrirModalSubir = function() {
    if (!usuarioActual) {
        mostrarNotificacion("Debes iniciar sesión para compartir publicaciones.", "error");
        window.location.href = 'inicio_sesion.html';
        return;
    }
    document.getElementById('modal-subir').classList.remove('hidden');
}

window.cerrarModalSubir = function() {
    document.getElementById('modal-subir').classList.add('hidden');
}

window.abrirModalExperiencia = function() {
    if (!usuarioActual) {
        mostrarNotificacion("Debes iniciar sesión para compartir tu experiencia.", "error");
        window.location.href = 'inicio_sesion.html';
        return;
    }
    document.getElementById('modal-experiencia').classList.remove('hidden');
}

window.cerrarModalExperiencia = function() {
    document.getElementById('modal-experiencia').classList.add('hidden');
}

window.cerrarSesion = async function() {
    await signOut(auth);
    modoAdminVisualizacion = false;
    window.location.href = 'inicio_sesion.html';
}

window.subirPublicacion = async function(e) {
    e.preventDefault();
    if (!usuarioActual) return;

    const imagenFiles = document.getElementById('sub-imagen').files;
    const archivoFile = document.getElementById('sub-archivo').files[0];
    const enlaceDrive = document.getElementById('sub-drive').value.trim();
    const opcionVisibilidad = document.getElementById('sub-visibilidad-autor').value;

    const unMegabyte = 1024 * 1024;
    let imagenesUrls = [];

    for (let file of imagenFiles) {
        if (file.size > unMegabyte) {
            mostrarNotificacion(`La imagen "${file.name}" supera 1 MB.`, "error");
            return;
        }
    }

    if (archivoFile && archivoFile.size > unMegabyte) {
        mostrarNotificacion("El archivo PDF/Word es demasiado pesado (Máx. 1 MB).", "error");
        return;
    }

    const btnSubmit = document.getElementById('btn-publicar-submit');
    btnSubmit.innerText = "Procesando archivos...";
    btnSubmit.disabled = true;

    try {
        for (let file of imagenFiles) {
            const base64 = await convertirArchivoABase64(file);
            imagenesUrls.push(base64);
        }

        let archivoUrl = "";
        let archivoNombre = "";
        if (archivoFile) {
            archivoUrl = await convertirArchivoABase64(archivoFile);
            archivoNombre = archivoFile.name;
        }

        let fotoUrlAutor = "";
        let nombreAutorFinal = usuarioActual.email;

        const userDocSnap = await getDoc(doc(db, "usuarios", usuarioActual.uid));
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const nombreUsuarioFallback = userData.usuario || usuarioActual.email.split('@')[0];
            const nombreCompletoFallback = userData.nombre || usuarioActual.email;

            if (opcionVisibilidad === 'usuario') {
                nombreAutorFinal = nombreUsuarioFallback;
                fotoUrlAutor = userData.fotoUrl || "";
            } else if (opcionVisibilidad === 'nombre') {
                nombreAutorFinal = nombreCompletoFallback;
                fotoUrlAutor = userData.fotoUrl || "";
            } else {
                nombreAutorFinal = usuarioActual.email;
                fotoUrlAutor = userData.fotoUrl || "";
            }
        }

        await addDoc(collection(db, "publicaciones"), {
            titulo: document.getElementById('sub-titulo').value,
            asignatura: document.getElementById('sub-asignatura').value,
            descripcion: document.getElementById('sub-desc').value,
            imagenesUrls: imagenesUrls,
            archivoUrl,
            archivoNombre,
            enlaceDrive,
            autor: usuarioActual.email,
            nombreAutor: nombreAutorFinal,
            fotoUrlAutor: fotoUrlAutor,
            estado: esAdmin ? "aprobado" : "pendiente",
            fecha: serverTimestamp()
        });

        mostrarNotificacion(esAdmin ? "Publicación creada con éxito." : "Publicación enviada a revisión docente.");
        cerrarModalSubir();
        document.getElementById('sub-titulo').value = '';
        document.getElementById('sub-desc').value = '';
        document.getElementById('sub-drive').value = '';
        quitarImagenes();
        quitarArchivo();
        cargarPublicaciones();
    } catch (error) {
        mostrarNotificacion("Error al guardar contenido: " + error.message, "error");
    } finally {
        btnSubmit.innerText = "Publicar en la Comunidad";
        btnSubmit.disabled = false;
    }
}

async function cargarAsignaturasDinamicas() {
    try {
        const querySnapshot = await getDocs(collection(db, "asignaturas"));
        let asignaturasFirestore = [];
        querySnapshot.forEach((docSnap) => {
            asignaturasFirestore.push({ id: docSnap.id, ...docSnap.data() });
        });

        listaGlobalAsignaturas = asignaturasFirestore.map(a => a.nombre);

        renderizarSelectAsignaturas();
        renderizarFiltrosAsignaturas();
        renderizarGestionMateriasAdmin(asignaturasFirestore);
    } catch (error) {
        console.error("Error al cargar asignaturas:", error);
    }
}

function renderizarSelectAsignaturas() {
    const select = document.getElementById('sub-asignatura');
    if (!select) return;

    select.innerHTML = listaGlobalAsignaturas.map(mat => `
        <option value="${mat}">${mat}</option>
    `).join('');
}

function renderizarFiltrosAsignaturas() {
    const contenedorFiltros = document.getElementById('contenedor-filtros-asignaturas');
    if (!contenedorFiltros) return;

    let htmlFiltros = `<button onclick="filtrarAsignatura('Todas')" id="btn-todas" class="px-3 py-1.5 rounded-xl text-xs font-medium ${filtroAsignaturaActual === 'Todas' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'} transition shrink-0">Todas</button>`;

    htmlFiltros += listaGlobalAsignaturas.map(mat => `
        <button onclick="filtrarAsignatura('${mat}')" class="px-3 py-1.5 rounded-xl text-xs font-medium ${filtroAsignaturaActual === mat ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition shrink-0">${mat}</button>
    `).join('');

    contenedorFiltros.innerHTML = htmlFiltros;
}

function renderizarGestionMateriasAdmin(asignaturasFirestore) {
    const panelAdminMaterias = document.getElementById('panel-gestion-materias');
    const listaAdmin = document.getElementById('lista-materias-admin');
    if (!panelAdminMaterias || !listaAdmin) return;

    if (esAdmin) {
        panelAdminMaterias.classList.remove('hidden');
        listaAdmin.innerHTML = asignaturasFirestore.map(a => `
            <div class="bg-slate-100 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 border border-slate-200">
                <span class="font-medium text-slate-700">${a.nombre}</span>
                <button onclick="eliminarAsignaturaAdmin('${a.id}')" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `).join('');
    } else {
        panelAdminMaterias.classList.add('hidden');
    }
}

window.agregarAsignaturaAdmin = async function(e) {
    e.preventDefault();
    if (!esAdmin) return;

    const input = document.getElementById('nueva-asignatura-input');
    const nombreMateria = input.value.trim();
    if (!nombreMateria) return;

    try {
        await addDoc(collection(db, "asignaturas"), { nombre: nombreMateria });
        input.value = '';
        mostrarNotificacion("Asignatura agregada con éxito.");
        cargarAsignaturasDinamicas();
    } catch (error) {
        mostrarNotificacion("Error al agregar asignatura: " + error.message, "error");
    }
}

window.eliminarAsignaturaAdmin = async function(id, nombreMateria) {
    if (!esAdmin) return;
    
    const pubsConMateria = listaGlobalPublicaciones.filter(p => p.asignatura === nombreMateria);
    
    if (pubsConMateria.length > 0) {
        mostrarNotificacion(`No se puede eliminar porque hay ${pubsConMateria.length} publicación(es) asociada(s).`, "error");
        return;
    }

    if (confirm("¿Estás seguro de eliminar esta asignatura?")) {
        try {
            await deleteDoc(doc(db, "asignaturas", id));
            mostrarNotificacion("Asignatura eliminada.");
            cargarAsignaturasDinamicas();
        } catch (error) {
            mostrarNotificacion("Error al eliminar: " + error.message, "error");
        }
    }
}

function renderizarCarruselMultimedia(coleccion, itemId, multimediaArray) {
    if (!multimediaArray || multimediaArray.length === 0) return '';
    
    let items = Array.isArray(multimediaArray) ? multimediaArray : [multimediaArray];
    if (items.length === 0) return '';

    if (items.length > 2) {
        return `
        <div class="relative rounded-xl overflow-x-auto flex gap-3 p-2 bg-slate-900 max-h-96 snap-x scrollbar-thin">
            ${items.map((elementoActual, idx) => {
                const esVideo = typeof elementoActual === 'string' && (elementoActual.includes('data:video') || elementoActual.endsWith('.mp4') || elementoActual.endsWith('.webm'));
                return `
                <div class="shrink-0 w-80 max-h-96 flex justify-center items-center snap-center rounded-lg overflow-hidden bg-black/40">
                    ${esVideo ? `
                        <video controls class="w-full max-h-96 object-contain">
                            <source src="${elementoActual}" type="video/mp4">
                            Tu navegador no soporta videos.
                        </video>
                    ` : `
                        <img src="${elementoActual}" class="object-contain w-full max-h-96" alt="Media adjunta ${idx + 1}">
                    `}
                </div>`;
            }).join('')}
        </div>
        `;
    }

    const key = coleccion + '_' + itemId;
    if (indicesCarrusel[key] === undefined) {
        indicesCarrusel[key] = 0;
    }
    const idxActual = indicesCarrusel[key];
    const elementoActual = items[idxActual];
    const esVideo = typeof elementoActual === 'string' && (elementoActual.includes('data:video') || elementoActual.endsWith('.mp4') || elementoActual.endsWith('.webm'));

    return `
    <div class="relative rounded-xl overflow-hidden border border-slate-100 bg-slate-900 flex justify-center items-center max-h-96 group">
        <div class="w-full flex justify-center max-h-96">
            ${esVideo ? `
                <video controls class="w-full max-h-96 object-contain">
                    <source src="${elementoActual}" type="video/mp4">
                    Tu navegador no soporta videos.
                </video>
            ` : `
                <img src="${elementoActual}" class="object-contain w-full max-h-96" alt="Media adjunta">
            `}
        </div>

        ${items.length > 1 && idxActual > 0 ? `
            <button type="button" onclick="cambiarSlide('${coleccion}', '${itemId}', -1,${items.length})" class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition opacity-80 group-hover:opacity-100 z-10">
                <i class="fa-solid fa-chevron-left text-xs"></i>
            </button>
        ` : ''}

        ${items.length > 1 && idxActual < items.length - 1 ? `
            <button type="button" onclick="cambiarSlide('${coleccion}', '${itemId}', 1,${items.length})" class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition opacity-80 group-hover:opacity-100 z-10">
                <i class="fa-solid fa-chevron-right text-xs"></i>
            </button>
        ` : ''}

        ${items.length > 1 ? `
            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-full z-10">
                ${items.map((_, i) => `
                    <span class="w-1.5 h-1.5 rounded-full transition-all ${i === idxActual ? 'bg-white w-2.5' : 'bg-white/50'}"></span>
                `).join('')}
            </div>
        ` : ''}
    </div>
    `;
}

window.cambiarSlide = function(coleccion, itemId, direccion, totalItems) {
    const key = coleccion + '_' + itemId;
    if (indicesCarrusel[key] === undefined) indicesCarrusel[key] = 0;
    
    indicesCarrusel[key] += direccion;
    if (indicesCarrusel[key] < 0) indicesCarrusel[key] = 0;
    if (indicesCarrusel[key] >= totalItems) indicesCarrusel[key] = totalItems - 1;

    rerenderizar(coleccion);
}

function obtenerItem(coleccion, id) {
    const lista = coleccion === 'publicaciones' ? listaGlobalPublicaciones : listaGlobalExperiencias;
    return lista.find(x => x.id === id);
}

function rerenderizar(coleccion) {
    if (coleccion === 'publicaciones') {
        window.renderizarPublicaciones();
    } else {
        renderizarExperiencias();
    }
}

function renderizarBarraSocial(coleccion, item) {
    const key = coleccion + '_' + item.id;
    const uid = usuarioActual ? usuarioActual.uid : null;
    const miReaccion = (uid && item.reacciones) ? item.reacciones[uid] : null;
    const totalReacciones = item.reacciones ? Object.keys(item.reacciones).length : 0;
    const totalComentarios = item.numComentarios || 0;
    const panelAbierto = panelesComentariosAbiertos.has(key);
    const comentarios = comentariosCache[key];

    return `
    <div class="pt-2 border-t border-slate-100 space-y-1.5">
        ${(totalReacciones > 0 || totalComentarios > 0) ? `
        <div class="flex justify-between items-center text-[11px] px-0.5" style="color:#9C927F;">
            <span>${totalReacciones > 0 ? '👍 ' + totalReacciones : ''}</span>
            <span>${totalComentarios > 0 ? totalComentarios + (totalComentarios === 1 ? ' comentario' : ' comentarios') : ''}</span>
        </div>` : ''}

        <div class="flex items-center -mx-1">
            <button type="button"
                onclick="toggleReaccionRapida('${coleccion}','${item.id}')"
                class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition hover:bg-slate-50 ${miReaccion ? 'font-bold' : ''}"
                style="color:${miReaccion ? '#2F6B4F' : '#8A7F6C'};">
                <span>👍</span>
                <span>Me gusta</span>
            </button>
            <button type="button" onclick="toggleComentarios('${coleccion}','${item.id}')" class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition hover:bg-slate-50" style="color:#8A7F6C;">
                <i class="fa-regular fa-comment"></i> Comentar
            </button>
        </div>

        ${panelAbierto ? `
        <div class="pt-2 border-t border-slate-100 space-y-2.5">
            ${usuarioActual ? `
            <form onsubmit="enviarComentario(event,'${coleccion}','${item.id}')" class="flex items-center gap-2">
                <input type="text" id="input-comentario-${coleccion}-${item.id}" placeholder="Escribe un comentario..." maxlength="500" required
                    class="flex-1 px-3 py-1.5 border rounded-full text-xs bg-[#FBF7EE] border-[#E7DFC9] focus:ring-2 transition" style="--tw-ring-color:#2F6B4F;">
                <button type="submit" class="text-white w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition hover:opacity-90" style="background-color:#2F6B4F;">
                    <i class="fa-solid fa-paper-plane text-xs"></i>
                </button>
            </form>` : ''}
            <div id="lista-comentarios-${coleccion}-${item.id}" class="space-y-2">
                ${comentarios === undefined ? `<p class="text-[11px] text-center py-1" style="color:#9C927F;">Cargando comentarios...</p>` : renderizarListaComentarios(coleccion, item.id, comentarios)}
            </div>
        ` : ''}
    </div>
    `;
}

function renderizarListaComentarios(coleccion, id, comentarios) {
    if (comentarios.length === 0) {
        return `<p class="text-[11px] text-center py-1" style="color:#9C927F;">Sé el primero en comentar.</p>`;
    }
    return comentarios.map(c => `
        <div class="flex items-start gap-2">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0" style="background-color:#F3ECDC; color:#1F3B2C;">
                <i class="fa-solid fa-user"></i>
            </div>
            <div class="flex-1 rounded-2xl px-3 py-1.5" style="background-color:#FBF7EE;">
                <div class="flex justify-between items-start gap-2">
                    <span class="text-[11px] font-bold text-slate-700">${c.autorNombre || c.autor}</span>
                    ${(usuarioActual && (c.autor === usuarioActual.email || esAdmin)) ? `<button onclick="eliminarComentario('${coleccion}','${id}','${c.id}')" class="text-[10px] transition" style="color:#C9BFA0;"><i class="fa-solid fa-xmark"></i></button>` : ''}
                </div>
                <p class="text-[11px] text-slate-600 leading-relaxed break-words">${c.texto}</p>
            </div>
        </div>
    `).join('');
}

window.toggleReaccionRapida = async function(coleccion, id) {
    if (!usuarioActual) { mostrarNotificacion("Debes iniciar sesión para reaccionar.", "error"); return; }
    const item = obtenerItem(coleccion, id);
    if (!item) return;
    const uid = usuarioActual.uid;
    const actual = item.reacciones ? item.reacciones[uid] : null;
    item.reacciones = item.reacciones || {};

    try {
        if (actual) {
            delete item.reacciones[uid];
            await updateDoc(doc(db, coleccion, id), { [`reacciones.${uid}`]: deleteField() });
        } else {
            item.reacciones[uid] = 'like';
            await updateDoc(doc(db, coleccion, id), { [`reacciones.${uid}`]: 'like' });
        }
    } catch (error) {
        mostrarNotificacion("No se pudo actualizar tu reacción: " + error.message, "error");
    }
    rerenderizar(coleccion);
}

async function cargarComentarios(coleccion, id) {
    const key = coleccion + '_' + id;
    try {
        const comentariosRef = collection(db, coleccion, id, 'comentarios');
        const q = query(comentariosRef, orderBy('fecha', 'asc'));
        const snap = await getDocs(q);
        const lista = [];
        snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
        comentariosCache[key] = lista;
    } catch (error) {
        comentariosCache[key] = [];
    }
    rerenderizar(coleccion);
}

window.toggleComentarios = function(coleccion, id) {
    const key = coleccion + '_' + id;
    if (panelesComentariosAbiertos.has(key)) {
        panelesComentariosAbiertos.delete(key);
        rerenderizar(coleccion);
    } else {
        panelesComentariosAbiertos.add(key);
        rerenderizar(coleccion);
        if (comentariosCache[key] === undefined) {
            cargarComentarios(coleccion, id);
        }
    }
}

window.enviarComentario = async function(e, coleccion, id) {
    e.preventDefault();
    if (!usuarioActual) return;
    const key = coleccion + '_' + id;
    const input = document.getElementById(`input-comentario-${coleccion}-${id}`);
    const texto = input.value.trim();
    if (!texto) return;

    let nombreAutor = usuarioActual.email;
    try {
        const userDocSnap = await getDoc(doc(db, "usuarios", usuarioActual.uid));
        if (userDocSnap.exists()) {
            const ud = userDocSnap.data();
            nombreAutor = ud.usuario || ud.nombre || usuarioActual.email;
        }
    } catch (error) {}

    const nuevoComentario = {
        autor: usuarioActual.email,
        autorNombre: nombreAutor,
        texto,
        fecha: serverTimestamp()
    };

    input.disabled = true;
    try {
        const ref = await addDoc(collection(db, coleccion, id, 'comentarios'), nuevoComentario);
        await updateDoc(doc(db, coleccion, id), { numComentarios: increment(1) });

        const item = obtenerItem(coleccion, id);
        if (item) item.numComentarios = (item.numComentarios || 0) + 1;

        if (!comentariosCache[key]) comentariosCache[key] = [];
        comentariosCache[key].push({ id: ref.id, ...nuevoComentario, fecha: new Date() });

        rerenderizar(coleccion);
    } catch (error) {
        mostrarNotificacion("No se pudo publicar el comentario: " + error.message, "error");
        input.disabled = false;
    }
}

window.eliminarComentario = async function(coleccion, id, comentarioId) {
    if (!confirm("¿Eliminar este comentario?")) return;
    const key = coleccion + '_' + id;
    try {
        await deleteDoc(doc(db, coleccion, id, 'comentarios', comentarioId));
        await updateDoc(doc(db, coleccion, id), { numComentarios: increment(-1) });

        const item = obtenerItem(coleccion, id);
        if (item) item.numComentarios = Math.max(0, (item.numComentarios || 1) - 1);

        if (comentariosCache[key]) {
            comentariosCache[key] = comentariosCache[key].filter(c => c.id !== comentarioId);
        }
        rerenderizar(coleccion);
    } catch (error) {
        mostrarNotificacion("No se pudo eliminar el comentario: " + error.message, "error");
    }
}

async function cargarPublicaciones() {
    const contenedor = document.getElementById('contenedor-publicaciones');
    if (!contenedor) return;
    
    contenedor.innerHTML = `<div class="bg-white p-12 rounded-2xl text-center border border-slate-200 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-emerald-600"></i><p class="text-xs md:text-sm">Actualizando muro...</p></div>`;

    try {
        const querySnapshot = await getDocs(collection(db, "publicaciones"));
        listaGlobalPublicaciones = [];
        querySnapshot.forEach((docSnap) => {
            listaGlobalPublicaciones.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderizarPublicaciones();
    } catch (error) {
        contenedor.innerHTML = `<div class="bg-white p-12 rounded-2xl text-center border border-slate-200 text-red-500 text-xs md:text-sm">Error al cargar publicaciones de Firestore.</div>`;
    }
}

window.renderizarPublicaciones = function() {
    const contenedor = document.getElementById('contenedor-publicaciones');
    if (!contenedor) return;
    
    let filtrados = listaGlobalPublicaciones;

    if (modoAdminVisualizacion && esAdmin) {
        filtrados = filtrados.filter(p => p.estado === 'pendiente' || p.estado === 'aprobado');
    } else {
        filtrados = filtrados.filter(p => p.estado === 'aprobado');
        if (filtroAsignaturaActual !== 'Todas') {
            filtrados = filtrados.filter(p => p.asignatura === filtroAsignaturaActual);
        }
    }

    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center border border-slate-200 text-slate-400 text-xs md:text-sm">No hay publicaciones disponibles en esta sección.</div>`;
        return;
    }

    contenedor.innerHTML = filtrados.map(p => `
        <div class="bg-white p-4 md:p-5 rounded-2xl shadow-xs border border-slate-200 space-y-3">
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-xs shrink-0" style="background-color:#F3ECDC; color:#1F3B2C;">
                        ${p.fotoUrlAutor ? `<img src="${p.fotoUrlAutor}" class="w-full h-full object-cover" alt="Avatar">` : `<i class="fa-solid fa-user"></i>`}
                    </div>
                    <div>
                        <h4 class="text-xs font-bold text-slate-700">${p.nombreAutor || p.autor || 'Anónimo'}</h4>
                        <span class="text-[10px] text-slate-400">Hace unos momentos</span>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full">${p.asignatura}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-md ${p.estado === 'aprobado' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700 font-bold'}">${p.estado.toUpperCase()}</span>
                </div>
            </div>

            <div>
                <h3 class="font-bold text-slate-800 text-sm md:text-base mb-1">${p.titulo}</h3>
                <p class="text-xs md:text-sm text-slate-600 leading-relaxed">${p.descripcion}</p>
            </div>

            ${p.imagenesUrls && p.imagenesUrls.length > 0 ? 
                renderizarCarruselMultimedia('publicaciones', p.id, p.imagenesUrls) : 
                (p.imagenUrl ? renderizarCarruselMultimedia('publicaciones', p.id, [p.imagenUrl]) : '')
            }

            ${p.archivoUrl ? `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div class="flex items-center space-x-2 overflow-hidden">
                        <i class="fa-solid fa-file-arrow-down text-emerald-600 text-lg shrink-0"></i>
                        <span class="text-xs font-medium text-slate-700 truncate">${p.archivoNombre || 'Documento adjunto'}</span>
                    </div>
                    <a href="${p.archivoUrl}" download="${p.archivoNombre || 'documento'}" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition shrink-0">
                        Descargar
                    </a>
                </div>
            ` : ''}

            ${p.enlaceDrive ? `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div class="flex items-center space-x-2 overflow-hidden">
                        <i class="fa-brands fa-google-drive text-emerald-600 text-lg shrink-0"></i>
                        <span class="text-xs font-medium text-slate-700 truncate">Enlace de Google Drive</span>
                    </div>
                    <a href="${p.enlaceDrive}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition shrink-0">
                        Abrir Drive
                    </a>
                </div>
            ` : ''}

            ${renderizarBarraSocial('publicaciones', p)}

            ${esAdmin ? `
                <div class="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                    ${p.estado === 'pendiente' ? `<button onclick="cambiarEstado('${p.id}', 'aprobado')" class="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg text-xs transition">Aprobar</button>` : ''}
                    <button onclick="eliminarPublicacion('${p.id}')" class="bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs transition"><i class="fa-solid fa-trash"></i> Eliminar</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}   

window.filtrarAsignatura = function(asignatura) {
    filtroAsignaturaActual = asignatura;
    modoAdminVisualizacion = false;
    renderizarPublicaciones();
}

window.cambiarVistaAdmin = function() {
    modoAdminVisualizacion = !modoAdminVisualizacion;
    renderizarPublicaciones();
}

window.cambiarEstado = async function(id, nuevoEstado) {
    try {
        await updateDoc(doc(db, "publicaciones", id), { estado: nuevoEstado });
        mostrarNotificacion("Estado actualizado con éxito.");
        cargarPublicaciones();
    } catch (error) {
        mostrarNotificacion("Error al actualizar: " + error.message, "error");
    }
}

window.eliminarPublicacion = async function(id) {
    if (confirm("¿Estás seguro de eliminar esta publicación?")) {
        try {
            await deleteDoc(doc(db, "publicaciones", id));
            mostrarNotificacion("Publicación eliminada.");
            cargarPublicaciones();
        } catch (error) {
            mostrarNotificacion("Error al eliminar: " + error.message, "error");
        }
    }
}

window.guardarExperienciaPractica = async function(e) {
    e.preventDefault();
    if (!usuarioActual) return;

    const nombreEscuela = document.getElementById('input-nombre-escuela').value;
    const linkMapa = document.getElementById('input-link-mapa').value.trim();
    const enlaceDrive = document.getElementById('input-link-drive').value.trim();
    const textoExperiencia = document.getElementById('input-texto-experiencia').value;
    const fotoFiles = document.getElementById('input-media-foto').files;
    const videoFile = document.getElementById('input-media-video').files[0];

    const unMegabyte = 1024 * 1024;
    let fotosBase64 = [];

    for (let file of fotoFiles) {
        if (file.size > unMegabyte) {
            mostrarNotificacion(`La fotografía "${file.name}" supera 1 MB.`, "error");
            return;
        }
    }

    if (videoFile && videoFile.size > unMegabyte) {
        mostrarNotificacion("El video es muy pesado (Máx. 1 MB).", "error");
        return;
    }

    const btnSubmit = document.getElementById('btn-publicar-exp');
    btnSubmit.innerText = "Guardando experiencia...";
    btnSubmit.disabled = true;

    try {
        for (let file of fotoFiles) {
            const b64 = await convertirArchivoABase64(file);
            fotosBase64.push(b64);
        }

        let videoBase64 = "";
        if (videoFile) {
            videoBase64 = await convertirArchivoABase64(videoFile);
        }

        await addDoc(collection(db, "experiencias_practicas"), {
            escuela: nombreEscuela,
            linkMapa: linkMapa,
            enlaceDrive,
            experiencia: textoExperiencia,
            fotosUrls: fotosBase64,
            videoUrl: videoBase64,
            autorEmail: usuarioActual.email,
            fecha: serverTimestamp()
        });

        mostrarNotificacion("¡Tu experiencia de prácticas ha sido publicada con éxito!");
        cerrarModalExperiencia();
        
        document.getElementById('input-nombre-escuela').value = '';
        document.getElementById('input-link-mapa').value = '';
        document.getElementById('input-link-drive').value = '';
        document.getElementById('input-texto-experiencia').value = '';
        quitarFotosExp();
        quitarVideoExp();
        cargarExperienciasPracticas();
    } catch (error) {
        mostrarNotificacion("Error al publicar: " + error.message, "error");
    } finally {
        btnSubmit.innerText = "Publicar Experiencia";
        btnSubmit.disabled = false;
    }
}

async function cargarExperienciasPracticas() {
    const contenedor = document.getElementById('contenedor-experiencias');
    if (!contenedor) return;

    contenedor.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center border border-slate-200 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-xl mb-2 text-emerald-600"></i><p class="text-xs">Cargando experiencias...</p></div>`;

    try {
        const querySnapshot = await getDocs(collection(db, "experiencias_practicas"));
        listaGlobalExperiencias = [];
        querySnapshot.forEach((docSnap) => {
            listaGlobalExperiencias.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderizarExperiencias();
    } catch (error) {
        contenedor.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center border border-slate-200 text-red-500 text-xs">Error al cargar experiencias.</div>`;
    }
}

function formatearFechaAmigable(timestamp) {
    if (!timestamp) return "Hace un momento";
    const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const ahora = new Date();
    const segundos = Math.floor((ahora - fecha) / 1000);

    if (segundos < 60) return "Hace unos momentos";
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `Hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    const dias = Math.floor(horas / 24);
    if (dias < 30) return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
    const meses = Math.floor(dias / 30);
    if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    const anios = Math.floor(meses / 12);
    return `Hace ${anios} ${anios === 1 ? 'año' : 'años'}`;
}

function renderizarExperiencias() {
    const contenedor = document.getElementById('contenedor-experiencias');
    if (!contenedor) return;

    if (listaGlobalExperiencias.length === 0) {
        contenedor.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center border border-slate-200 text-xs text-slate-400">Aún no hay experiencias de prácticas registradas.</div>`;
        return;
    }

    contenedor.innerHTML = listaGlobalExperiencias.map(e => `
        <div class="bg-white p-4 md:p-5 rounded-2xl shadow-xs border border-slate-200 space-y-3">
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-xs shrink-0" style="background-color:#F3ECDC; color:#1F3B2C;">
                        <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div>
                        <h4 class="text-xs font-bold text-slate-800">${e.autorEmail || 'Estudiante'}</h4>
                        <p class="text-[10px] text-slate-400">
                            <span>${e.escuela}</span> &bull; <span>${formatearFechaAmigable(e.fecha)}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <p class="text-xs md:text-sm text-slate-600 leading-relaxed">${e.experiencia}</p>
            </div>

            ${e.linkMapa ? `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div class="flex items-center space-x-2 overflow-hidden">
                        <i class="fa-solid fa-map-location-dot text-emerald-600 text-lg shrink-0"></i>
                        <span class="text-xs font-medium text-slate-700 truncate">Ubicación de la Telesecundaria</span>
                    </div>
                    <a href="${e.linkMapa}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition shrink-0">
                        Ver en Mapa
                    </a>
                </div>
            ` : ''}

            ${e.fotosUrls && e.fotosUrls.length > 0 ? 
                renderizarCarruselMultimedia('experiencias_practicas', e.id, e.fotosUrls) : 
                (e.fotoUrl ? renderizarCarruselMultimedia('experiencias_practicas', e.id, [e.fotoUrl]) : '')
            }

            ${e.videoUrl ? `
                <div class="rounded-xl overflow-hidden border border-slate-100 bg-slate-50 p-2">
                    <video controls class="w-full max-h-80 rounded-lg">
                        <source src="${e.videoUrl}" type="video/mp4">
                        Tu navegador no soporta videos.
                    </video>
                </div>
            ` : ''}

            ${e.enlaceDrive ? `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div class="flex items-center space-x-2 overflow-hidden">
                        <i class="fa-brands fa-google-drive text-emerald-600 text-lg shrink-0"></i>
                        <span class="text-xs font-medium text-slate-700 truncate">Enlace de Google Drive</span>
                    </div>
                    <a href="${e.enlaceDrive}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition shrink-0">
                        Abrir Drive
                    </a>
                </div>
            ` : ''}

            ${renderizarBarraSocial('experiencias_practicas', e)}

            ${(esAdmin || (usuarioActual && e.autorEmail === usuarioActual.email)) ? `
                <div class="flex justify-end pt-2 border-t border-slate-100">
                    <button onclick="eliminarExperiencia('${e.id}')" class="bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs transition">
                        <i class="fa-solid fa-trash mr-1"></i> Eliminar
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

window.eliminarExperiencia = async function(id) {
    if (confirm("¿Estás seguro de eliminar esta experiencia?")) {
        try {
            await deleteDoc(doc(db, "experiencias_practicas", id));
            listaGlobalExperiencias = listaGlobalExperiencias.filter(e => e.id !== id);
            renderizarExperiencias();
            mostrarNotificacion("Experiencia eliminada con éxito.");
        } catch (error) {
            mostrarNotificacion("Error al eliminar: " + error.message, "error");
        }
    }
}