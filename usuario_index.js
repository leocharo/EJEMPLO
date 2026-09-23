import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, updateDoc, serverTimestamp, deleteField, increment, query, orderBy } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
let misPubsCache = [];
let misExpsCache = [];
let listaGlobalAsignaturas = ['Español', 'Matemáticas', 'Ciencias'];

let comentariosCache = {};
let panelesComentariosAbiertos = new Set();
let indicesCarrusel = {};

window.mostrarNotificacion = function(mensaje, tipo = 'exito') {
    const contenedor = document.getElementById('contenedor-notificaciones');
    if (!contenedor) return;

    const notif = document.createElement('div');
    notif.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-lg text-xs md:text-sm font-medium text-white transition-all transform translate-y-2 opacity-0 flex items-center gap-2 ${
        tipo === 'error' ? 'bg-red-600' : 'bg-[#2F6B4F]'
    }`;
    notif.innerHTML = `<i class="fa-solid ${tipo === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${mensaje}</span>`;
    contenedor.appendChild(notif);

    setTimeout(() => notif.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => {
        notif.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => notif.remove(), 300);
    }, 3500);
}

const convertirArchivoABase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioActual = user;
        document.getElementById('perfil-email-display').innerText = user.email;
        await cargarAsignaturasDinamicas();
        await cargarDatosPerfil(user.uid);
        await cargarMisPublicaciones(user.email);
        await cargarMisExperiencias(user.email);
    } else {
        window.location.href = 'inicio_sesion.html';
    }
});

async function cargarAsignaturasDinamicas() {
    try {
        const querySnapshot = await getDocs(collection(db, "asignaturas"));
        let asignaturasFirestore = [];
        querySnapshot.forEach((docSnap) => {
            asignaturasFirestore.push(docSnap.data().nombre);
        });
        if (asignaturasFirestore.length > 0) {
            listaGlobalAsignaturas = asignaturasFirestore;
        }
    } catch (error) {
        console.error("Error al cargar asignaturas:", error);
    }
}

async function cargarDatosPerfil(uid) {
    try {
        const docRef = doc(db, "usuarios", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.nombre) document.getElementById('input-nombre-usuario').value = data.nombre;
            if (data.descripcion) document.getElementById('input-descripcion-usuario').value = data.descripcion;
            if (data.fotoUrl) {
                const imgPreview = document.getElementById('avatar-img-preview');
                const placeholder = document.getElementById('avatar-placeholder');
                imgPreview.src = data.fotoUrl;
                imgPreview.classList.remove('hidden');
                placeholder.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error("Error al cargar perfil:", error);
    }
}

window.guardarPerfil = async function(e) {
    e.preventDefault();
    if (!usuarioActual) return;

    const nombre = document.getElementById('input-nombre-usuario').value;
    const descripcion = document.getElementById('input-descripcion-usuario').value;
    const fotoFile = document.getElementById('input-foto-perfil').files[0];

    const unMegabyte = 1024 * 1024;
    if (fotoFile && fotoFile.size > unMegabyte) {
        mostrarNotificacion("La foto de perfil es muy pesada (Máx 1 MB).", "error");
        return;
    }

    const btn = document.getElementById('btn-guardar-perfil');
    btn.innerText = "Guardando...";
    btn.disabled = true;

    try {
        let fotoUrl = "";
        const docRef = doc(db, "usuarios", usuarioActual.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().fotoUrl) {
            fotoUrl = docSnap.data().fotoUrl;
        }

        if (fotoFile) {
            fotoUrl = await convertirArchivoABase64(fotoFile);
        }

        await setDoc(docRef, {
            nombre,
            descripcion,
            fotoUrl,
            email: usuarioActual.email
        }, { merge: true });

        mostrarNotificacion("¡Perfil actualizado con éxito!");
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        mostrarNotificacion("Error al actualizar perfil: " + error.message, "error");
        btn.innerText = "Guardar Cambios de Perfil";
        btn.disabled = false;
    }
}

// --- VISOR MULTIMEDIA CON SCROLL AUTOMÁTICO PARA EL PERFIL ---
function renderizarCarruselMultimediaPerfil(coleccion, itemId, multimediaArray) {
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
            <button type="button" onclick="cambiarSlidePerfil('${coleccion}', '${itemId}', -1,${items.length})" class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition opacity-80 group-hover:opacity-100 z-10">
                <i class="fa-solid fa-chevron-left text-xs"></i>
            </button>
        ` : ''}

        ${items.length > 1 && idxActual < items.length - 1 ? `
            <button type="button" onclick="cambiarSlidePerfil('${coleccion}', '${itemId}', 1,${items.length})" class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition opacity-80 group-hover:opacity-100 z-10">
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

window.cambiarSlidePerfil = function(coleccion, itemId, direccion, totalItems) {
    const key = coleccion + '_' + itemId;
    if (indicesCarrusel[key] === undefined) indicesCarrusel[key] = 0;
    
    indicesCarrusel[key] += direccion;
    if (indicesCarrusel[key] < 0) indicesCarrusel[key] = 0;
    if (indicesCarrusel[key] >= totalItems) indicesCarrusel[key] = totalItems - 1;

    rerenderizarPerfil(coleccion);
}

// --- CARGAR MIS PUBLICACIONES ---
async function cargarMisPublicaciones(emailUsuario) {
    const contenedor = document.getElementById('contenedor-mis-publicaciones');
    try {
        const querySnapshot = await getDocs(collection(db, "publicaciones"));
        misPubsCache = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.autor === emailUsuario) {
                misPubsCache.push({ id: docSnap.id, ...data });
            }
        });

        renderizarMisPublicaciones();
    } catch (error) {
        contenedor.innerHTML = `<div class="bg-white p-6 rounded-2xl text-center border text-red-500 text-xs" style="border-color:#E7DFC9;">Error al cargar tus publicaciones.</div>`;
    }
}

window.renderizarMisPublicaciones = function() {
    const contenedor = document.getElementById('contenedor-mis-publicaciones');
    if (!contenedor) return;

    if (misPubsCache.length === 0) {
        contenedor.innerHTML = `<div class="bg-white p-6 rounded-2xl text-center border text-xs" style="border-color:#E7DFC9; color:#9C927F;">Aún no has realizado ninguna publicación en el foro.</div>`;
        return;
    }

    contenedor.innerHTML = misPubsCache.map(p => `
        <div class="bg-white p-4 md:p-5 rounded-2xl shadow-xs border space-y-3" style="border-color:#E7DFC9;">
            <div class="flex justify-between items-start">
                <span class="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full">${p.asignatura}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-md ${p.estado === 'aprobado' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700 font-bold'}">${p.estado.toUpperCase()}</span>
            </div>
            <div>
                <h4 class="font-bold text-slate-800 text-sm mb-1">${p.titulo}</h4>
                <p class="text-xs text-slate-600 leading-relaxed">${p.descripcion}</p>
            </div>

            ${p.imagenesUrls && p.imagenesUrls.length > 0 ? 
                renderizarCarruselMultimediaPerfil('publicaciones', p.id, p.imagenesUrls) : 
                (p.imagenUrl ? renderizarCarruselMultimediaPerfil('publicaciones', p.id, [p.imagenUrl]) : '')
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
            
            ${renderizarBarraSocialPerfil('publicaciones', p)}

            <div class="flex justify-end space-x-2 pt-2 border-t" style="border-color:#F0EADA;">
                <button onclick="abrirModalEditar('${p.id}')" class="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1 rounded-lg text-xs transition">
                    <i class="fa-solid fa-pen-to-square mr-1"></i> Editar
                </button>
                <button onclick="eliminarMiPublicacion('${p.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs transition">
                    <i class="fa-solid fa-trash mr-1"></i> Eliminar
                </button>
            </div>
        </div>
    `).join('');
}

// --- FUNCIONES DE EDICIÓN DE PUBLICACIONES ---
window.abrirModalEditar = function(id) {
    const pub = misPubsCache.find(p => p.id === id);
    if (!pub) return;

    document.getElementById('edit-pub-id').value = pub.id;
    document.getElementById('edit-titulo').value = pub.titulo || '';
    document.getElementById('edit-desc').value = pub.descripcion || '';

    // Cargar selector de asignaturas dinámicamente
    const selectAsignatura = document.getElementById('edit-asignatura');
    selectAsignatura.innerHTML = listaGlobalAsignaturas.map(mat => `
        <option value="${mat}" ${pub.asignatura === mat ? 'selected' : ''}>${mat}</option>
    `).join('');

    document.getElementById('modal-editar-pub').classList.remove('hidden');
}

window.cerrarModalEditar = function() {
    document.getElementById('modal-editar-pub').classList.add('hidden');
}

window.actualizarPublicacion = async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-pub-id').value;
    const titulo = document.getElementById('edit-titulo').value.trim();
    const asignatura = document.getElementById('edit-asignatura').value;
    const descripcion = document.getElementById('edit-desc').value.trim();
    const imagenFiles = document.getElementById('edit-imagenes').files;
    const archivoFile = document.getElementById('edit-archivo').files[0];

    if (!id || !titulo || !descripcion) return;

    const unMegabyte = 1024 * 1024;
    let datosActualizacion = { titulo, asignatura, descripcion };

    try {
        if (imagenFiles.length > 0) {
            let nuevasImgs = [];
            for (let file of imagenFiles) {
                if (file.size > unMegabyte) {
                    mostrarNotificacion(`La imagen "${file.name}" supera 1 MB.`, "error");
                    return;
                }
                const b64 = await convertirArchivoABase64(file);
                nuevasImgs.push(b64);
            }
            datosActualizacion.imagenesUrls = nuevasImgs;
        }

        if (archivoFile) {
            if (archivoFile.size > unMegabyte) {
                mostrarNotificacion("El archivo adjunto es muy pesado (Máx 1 MB).", "error");
                return;
            }
            datosActualizacion.archivoUrl = await convertirArchivoABase64(archivoFile);
            datosActualizacion.archivoNombre = archivoFile.name;
        }

        await updateDoc(doc(db, "publicaciones", id), datosActualizacion);

        const pub = misPubsCache.find(p => p.id === id);
        if (pub) {
            pub.titulo = titulo;
            pub.asignatura = asignatura;
            pub.descripcion = descripcion;
            if (datosActualizacion.imagenesUrls) pub.imagenesUrls = datosActualizacion.imagenesUrls;
            if (datosActualizacion.archivoUrl) {
                pub.archivoUrl = datosActualizacion.archivoUrl;
                pub.archivoNombre = datosActualizacion.archivoNombre;
            }
        }

        mostrarNotificacion("Publicación actualizada con éxito.");
        cerrarModalEditar();
        renderizarMisPublicaciones();
    } catch (error) {
        mostrarNotificacion("Error al actualizar: " + error.message, "error");
    }
}

// --- CARGAR MIS EXPERIENCIAS ---
async function cargarMisExperiencias(emailUsuario) {
    const contenedor = document.getElementById('contenedor-mis-experiencias');
    try {
        const querySnapshot = await getDocs(collection(db, "experiencias_practicas"));
        misExpsCache = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.autorEmail === emailUsuario) {
                misExpsCache.push({ id: docSnap.id, ...data });
            }
        });

        renderizarMisExperiencias();
    } catch (error) {
        contenedor.innerHTML = `<div class="bg-white p-6 rounded-2xl text-center border text-red-500 text-xs" style="border-color:#E7DFC9;">Error al cargar tus experiencias.</div>`;
    }
}

window.renderizarMisExperiencias = function() {
    const contenedor = document.getElementById('contenedor-mis-experiencias');
    if (!contenedor) return;

    if (misExpsCache.length === 0) {
        contenedor.innerHTML = `<div class="bg-white p-6 rounded-2xl text-center border text-xs" style="border-color:#E7DFC9; color:#9C927F;">Aún no has registrado experiencias de prácticas.</div>`;
        return;
    }

    contenedor.innerHTML = misExpsCache.map(e => `
        <div class="bg-white p-4 md:p-5 rounded-2xl shadow-xs border space-y-3" style="border-color:#E7DFC9;">
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style="background-color:#F3ECDC; color:#1F3B2C;">
                        <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div>
                        <h4 class="text-xs font-bold text-slate-700">${e.escuela}</h4>
                        <span class="text-[10px] text-slate-400">Experiencia práctica docente</span>
                    </div>
                </div>
                ${e.linkMapa ? `
                    <a href="${e.linkMapa}" target="_blank" class="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition flex items-center gap-1 shrink-0">
                        <i class="fa-solid fa-map-location-dot"></i> Ver ubicación
                    </a>
                ` : ''}
            </div>

            <div>
                <p class="text-xs md:text-sm text-slate-600 leading-relaxed">${e.experiencia}</p>
            </div>

            ${e.fotosUrls && e.fotosUrls.length > 0 ? 
                renderizarCarruselMultimediaPerfil('experiencias_practicas', e.id, e.fotosUrls) : 
                (e.fotoUrl ? renderizarCarruselMultimediaPerfil('experiencias_practicas', e.id, [e.fotoUrl]) : '')
            }

            ${renderizarBarraSocialPerfil('experiencias_practicas', e)}

            <div class="flex justify-end pt-2 border-t" style="border-color:#F0EADA;">
                <button onclick="eliminarMiExperiencia('${e.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs transition">
                    <i class="fa-solid fa-trash mr-1"></i> Eliminar Experiencia
                </button>
            </div>
        </div>
    `).join('');
}

function obtenerItemPerfil(coleccion, id) {
    if (coleccion === 'publicaciones') return misPubsCache.find(x => x.id === id);
    return misExpsCache.find(x => x.id === id);
}

function rerenderizarPerfil(coleccion) {
    if (coleccion === 'publicaciones') renderizarMisPublicaciones();
    else renderizarMisExperiencias();
}

function renderizarBarraSocialPerfil(coleccion, item) {
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
                onclick="toggleReaccionRapidaPerfil('${coleccion}','${item.id}')"
                class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition hover:bg-slate-50 ${miReaccion ? 'font-bold' : ''}"
                style="color:${miReaccion ? '#2F6B4F' : '#8A7F6C'};">
                <span>👍</span>
                <span>Me gusta</span>
            </button>
            <button type="button" onclick="toggleComentariosPerfil('${coleccion}','${item.id}')" class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition hover:bg-slate-50" style="color:#8A7F6C;">
                <i class="fa-regular fa-comment"></i> Comentar
            </button>
        </div>

        ${panelAbierto ? `
        <div class="pt-2 border-t border-slate-100 space-y-2.5">
            ${usuarioActual ? `
            <form onsubmit="enviarComentarioPerfil(event,'${coleccion}','${item.id}')" class="flex items-center gap-2">
                <input type="text" id="input-comentario-perfil-${coleccion}-${item.id}" placeholder="Escribe un comentario..." maxlength="500" required
                    class="flex-1 px-3 py-1.5 border rounded-full text-xs bg-[#FBF7EE] border-[#E7DFC9] focus:ring-2 transition" style="--tw-ring-color:#2F6B4F;">
                <button type="submit" class="text-white w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition hover:opacity-90" style="background-color:#2F6B4F;">
                    <i class="fa-solid fa-paper-plane text-xs"></i>
                </button>
            </form>` : ''}
            <div class="space-y-2">
                ${comentarios === undefined ? `<p class="text-[11px] text-center py-1" style="color:#9C927F;">Cargando comentarios...</p>` : renderizarListaComentariosPerfil(coleccion, item.id, comentarios)}
            </div>
        </div>` : ''}
    </div>
    `;
}

function renderizarListaComentariosPerfil(coleccion, id, comentarios) {
    if (comentarios.length === 0) return `<p class="text-[11px] text-center py-1" style="color:#9C927F;">Sé el primero en comentar.</p>`;
    return comentarios.map(c => `
        <div class="flex items-start gap-2">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0" style="background-color:#F3ECDC; color:#1F3B2C;"><i class="fa-solid fa-user"></i></div>
            <div class="flex-1 rounded-2xl px-3 py-1.5" style="background-color:#FBF7EE;">
                <div class="flex justify-between items-start gap-2">
                    <span class="text-[11px] font-bold text-slate-700">${c.autorNombre || c.autor}</span>
                    ${(usuarioActual && c.autor === usuarioActual.email) ? `<button onclick="eliminarComentarioPerfil('${coleccion}','${id}','${c.id}')" class="text-[10px]" style="color:#C9BFA0;"><i class="fa-solid fa-xmark"></i></button>` : ''}
                </div>
                <p class="text-[11px] text-slate-600 leading-relaxed break-words">${c.texto}</p>
            </div>
        </div>
    `).join('');
}

window.toggleReaccionRapidaPerfil = async function(coleccion, id) {
    if (!usuarioActual) return;
    const item = obtenerItemPerfil(coleccion, id);
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
        rerenderizarPerfil(coleccion);
    } catch (error) {
        mostrarNotificacion("Error al reaccionar: " + error.message, "error");
    }
}

window.toggleComentariosPerfil = async function(coleccion, id) {
    const key = coleccion + '_' + id;
    if (panelesComentariosAbiertos.has(key)) {
        panelesComentariosAbiertos.delete(key);
    } else {
        panelesComentariosAbiertos.add(key);
        if (comentariosCache[key] === undefined) {
            try {
                const q = query(collection(db, coleccion, id, 'comentarios'), orderBy('fecha', 'asc'));
                const snap = await getDocs(q);
                const lista = [];
                snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
                comentariosCache[key] = lista;
            } catch (e) {
                comentariosCache[key] = [];
            }
        }
    }
    rerenderizarPerfil(coleccion);
}

window.enviarComentarioPerfil = async function(e, coleccion, id) {
    e.preventDefault();
    if (!usuarioActual) return;
    const key = coleccion + '_' + id;
    const input = document.getElementById(`input-comentario-perfil-${coleccion}-${id}`);
    const texto = input.value.trim();
    if (!texto) return;

    let nombreAutor = usuarioActual.email;
    try {
        const ud = (await getDoc(doc(db, "usuarios", usuarioActual.uid))).data();
        if (ud) nombreAutor = ud.usuario || ud.nombre || usuarioActual.email;
    } catch (e) {}

    const nuevo = { autor: usuarioActual.email, autorNombre: nombreAutor, texto, fecha: serverTimestamp() };
    try {
        const ref = await addDoc(collection(db, coleccion, id, 'comentarios'), nuevo);
        await updateDoc(doc(db, coleccion, id), { numComentarios: increment(1) });
        
        const item = obtenerItemPerfil(coleccion, id);
        if (item) item.numComentarios = (item.numComentarios || 0) + 1;

        if (!comentariosCache[key]) comentariosCache[key] = [];
        comentariosCache[key].push({ id: ref.id, ...nuevo, fecha: new Date() });
        rerenderizarPerfil(coleccion);
    } catch (error) {
        mostrarNotificacion("No se pudo comentar: " + error.message, "error");
    }
}

window.eliminarComentarioPerfil = async function(coleccion, id, comentarioId) {
    const key = coleccion + '_' + id;
    try {
        await deleteDoc(doc(db, coleccion, id, 'comentarios', comentarioId));
        await updateDoc(doc(db, coleccion, id), { numComentarios: increment(-1) });
        
        const item = obtenerItemPerfil(coleccion, id);
        if (item) item.numComentarios = Math.max(0, (item.numComentarios || 1) - 1);

        if (comentariosCache[key]) {
            comentariosCache[key] = comentariosCache[key].filter(c => c.id !== comentarioId);
        }
        rerenderizarPerfil(coleccion);
    } catch (error) {
        mostrarNotificacion("Error al eliminar comentario", "error");
    }
}

window.eliminarMiPublicacion = async function(id) {
    if (confirm("¿Estás seguro de eliminar esta publicación?")) {
        try {
            await deleteDoc(doc(db, "publicaciones", id));
            mostrarNotificacion("Publicación eliminada con éxito.");
            misPubsCache = misPubsCache.filter(p => p.id !== id);
            renderizarMisPublicaciones();
        } catch (error) {
            mostrarNotificacion("Error al eliminar: " + error.message, "error");
        }
    }
}

window.eliminarMiExperiencia = async function(id) {
    if (confirm("¿Estás seguro de eliminar esta experiencia?")) {
        try {
            await deleteDoc(doc(db, "experiencias_practicas", id));
            mostrarNotificacion("Experiencia eliminada con éxito.");
            misExpsCache = misExpsCache.filter(e => e.id !== id);
            renderizarMisExperiencias();
        } catch (error) {
            mostrarNotificacion("Error al eliminar: " + error.message, "error");
        }
    }
}