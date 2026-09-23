import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged, reload } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

let modoActual = 'login';
let tiempoRestanteReenvio = 0;
let intervaloContador = null;

// --- SISTEMA DE NOTIFICACIONES FLOTANTES ---
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

onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (!user.emailVerified) {
            const formAuth = document.getElementById('form-auth-pagina');
            const seccionVerificacion = document.getElementById('seccion-verificacion-pendiente');
            const emailEnviado = document.getElementById('email-usuario-enviado');
            
            if (formAuth) formAuth.classList.add('hidden');
            if (seccionVerificacion) seccionVerificacion.classList.remove('hidden');
            if (emailEnviado) emailEnviado.innerText = user.email;
        } else {
            window.location.href = 'index.html';
        }
    }
});

window.cambiarModoAuth = function(modo) {
    modoActual = modo;
    const nombreContainer = document.getElementById('campo-nombre-container');
    const usuarioContainer = document.getElementById('campo-usuario-container');
    const titulo = document.getElementById('auth-titulo-principal');
    const subtitulo = document.getElementById('auth-subtitulo');
    const btn = document.getElementById('auth-submit-btn');
    const textoAlternativo = document.getElementById('auth-texto-alternativo');
    const contenedorOlvido = document.getElementById('contenedor-olvido-pass');
    const panelRequisitos = document.getElementById('panel-requisitos-password');

    if (modo === 'register') {
        if (nombreContainer) nombreContainer.classList.remove('hidden');
        if (usuarioContainer) usuarioContainer.classList.remove('hidden');
        if (panelRequisitos) panelRequisitos.classList.remove('hidden');
        if (document.getElementById('auth-nombre')) document.getElementById('auth-nombre').required = true;
        if (document.getElementById('auth-usuario')) document.getElementById('auth-usuario').required = true;
        if (titulo) titulo.innerText = "Crear Cuenta";
        if (subitulo) subtitulo.innerText = "Regístrate para compartir materiales educativos";
        if (btn) btn.innerText = "Registrarse";
        if (contenedorOlvido) contenedorOlvido.classList.add('hidden');
        
        if (textoAlternativo) {
            textoAlternativo.innerHTML = `¿Ya tienes cuenta? <button type="button" onclick="cambiarModoAuth('login')" class="font-semibold hover:underline" style="color:#2F6B4F;">Iniciar sesión</button>`;
        }
    } else {
        if (nombreContainer) nombreContainer.classList.add('hidden');
        if (usuarioContainer) usuarioContainer.classList.add('hidden');
        if (panelRequisitos) panelRequisitos.classList.add('hidden');
        if (document.getElementById('auth-nombre')) document.getElementById('auth-nombre').required = false;
        if (document.getElementById('auth-usuario')) document.getElementById('auth-usuario').required = false;
        if (titulo) titulo.innerText = "Iniciar Sesión";
        if (subitulo) subtitulo.innerText = "Accede a la comunidad de materiales didácticos";
        if (btn) btn.innerText = "Entrar a la Comunidad";
        if (contenedorOlvido) contenedorOlvido.classList.remove('hidden');
        
        if (textoAlternativo) {
            textoAlternativo.innerHTML = `¿No tienes cuenta? <button type="button" onclick="cambiarModoAuth('register')" class="font-semibold hover:underline" style="color:#2F6B4F;">Regístrate aquí</button>`;
        }
    }
}

window.validarRequisitosPassword = function(password) {
    if (modoActual !== 'register') return;

    const reqLongitud = document.getElementById('req-longitud');
    const reqMayuscula = document.getElementById('req-mayuscula');
    const reqNumero = document.getElementById('req-numero');
    const reqEspecial = document.getElementById('req-especial');

    const tieneLongitud = password.length >= 8;
    const tieneMayuscula = /[A-Z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    const tieneEspecial = /[!@#$%^&*(),.?":{}|<>_\-]/.test(password);

    actualizarEstadoRequisito(reqLongitud, tieneLongitud);
    actualizarEstadoRequisito(reqMayuscula, tieneMayuscula);
    actualizarEstadoRequisito(reqNumero, tieneNumero);
    actualizarEstadoRequisito(reqEspecial, tieneEspecial);
}

function actualizarEstadoRequisito(elemento, cumple) {
    if (!elemento) return;
    const icono = elemento.querySelector('i');
    if (cumple) {
        elemento.classList.remove('text-red-500');
        elemento.classList.add('text-emerald-600');
        icono.classList.remove('fa-xmark');
        icono.classList.add('fa-check');
    } else {
        elemento.classList.remove('text-emerald-600');
        elemento.classList.add('text-red-500');
        icono.classList.remove('fa-check');
        icono.classList.add('fa-xmark');
    }
}

window.alternarVisibilidadPassword = function() {
    const inputPassword = document.getElementById('auth-password');
    const iconoOjo = document.getElementById('icono-ojo');
    
    if (inputPassword.type === 'password') {
        inputPassword.type = 'text';
        if (iconoOjo) {
            iconoOjo.classList.remove('fa-eye');
            iconoOjo.classList.add('fa-eye-slash');
        }
    } else {
        inputPassword.type = 'password';
        if (iconoOjo) {
            iconoOjo.classList.remove('fa-eye-slash');
            iconoOjo.classList.add('fa-eye');
        }
    }
}

window.manejarAuthPagina = async function(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const nombre = document.getElementById('auth-nombre')?.value.trim() || "Usuario";
    const usuario = document.getElementById('auth-usuario')?.value.trim() || "usuario_generico";

    try {
        if (modoActual === 'register') {
            const regexPassword = /^(?=.*[A-Z])(?=.*[!@#$\%^&*(),.?":{}\vert{}<>_\-]).{8,}$/;
            if (!regexPassword.test(password)) {
                mostrarNotificacion("La contraseña debe tener al menos 8 caracteres, una letra mayúscula y un carácter especial.", "error");
                return;
            }

            // Validar estrictamente si el usuario ya existe ANTES de crear la cuenta en Auth
            const usuariosRef = collection(db, "usuarios");
            const q = query(usuariosRef, where("usuario", "==", usuario));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                mostrarNotificacion("El nombre de usuario ya está en uso. Elige otro.", "error");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            await setDoc(doc(db, "usuarios", userCredential.user.uid), {
                nombre: nombre,
                usuario: usuario,
                email: email,
                rol: "estudiante",
                fotoUrl: "",
                descripcion: "",
                fechaCreacion: serverTimestamp()
            });

            await sendEmailVerification(userCredential.user);
            iniciarContadorReenvio();
            mostrarNotificacion("¡Cuenta creada con éxito! Revisa tu correo de confirmación.");
        } else {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            if (!userCredential.user.emailVerified) {
                mostrarNotificacion("Por favor, verifica tu correo electrónico antes de ingresar.", "error");
                return;
            }
            window.location.href = 'index.html';
        }
    } catch (error) {
        let mensajeAmigable = "Ocurrió un error inesperado. Inténtalo de nuevo.";

        switch (error.code) {
            case 'auth/email-already-in-use':
                mensajeAmigable = "Este correo electrónico ya está registrado.";
                break;
            case 'auth/invalid-email':
                mensajeAmigable = "El formato del correo electrónico no es válido.";
                break;
            case 'auth/weak-password':
                mensajeAmigable = "La contraseña es demasiado débil.";
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                mensajeAmigable = "Correo o contraseña incorrectos.";
                break;
            case 'auth/too-many-requests':
                mensajeAmigable = "Demasiados intentos fallidos. Espera un momento.";
                break;
        }

        mostrarNotificacion(mensajeAmigable, "error");
    }
}

window.recuperarContraseña = async function() {
    const emailInput = document.getElementById('auth-email').value;
    if (!emailInput) {
        mostrarNotificacion("Escribe tu correo electrónico para recuperar tu contraseña.", "error");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, emailInput);
        mostrarNotificacion("Enlace de restablecimiento enviado a tu correo.");
    } catch (error) {
        mostrarNotificacion("No se pudo enviar el correo. Verifica la dirección.", "error");
    }
}

window.verificarEstadoCuenta = async function() {
    const user = auth.currentUser;
    if (user) {
        await reload(user);
        if (user.emailVerified) {
            window.location.href = 'index.html';
        } else {
            mostrarNotificacion("Tu correo aún no ha sido verificado.", "error");
        }
    } else {
        location.reload();
    }
}

function iniciarContadorReenvio() {
    tiempoRestanteReenvio = 60;
    const btnReenviar = document.getElementById('btn-reenviar-correo');
    if (!btnReenviar) return;
    
    btnReenviar.disabled = true;
    if (intervaloContador) clearInterval(intervaloContador);

    intervaloContador = setInterval(() => {
        tiempoRestanteReenvio--;
        if (tiempoRestanteReenvio > 0) {
            btnReenviar.innerText = `Reenviar correo (${tiempoRestanteReenvio}s)`;
            btnReenviar.style.opacity = "0.6";
        } else {
            clearInterval(intervaloContador);
            btnReenviar.disabled = false;
            btnReenviar.innerText = "Reenviar correo de verificación";
            btnReenviar.style.opacity = "1";
        }
    }, 1000);
}

window.reenviarCorreoVerificacion = async function() {
    if (tiempoRestanteReenvio > 0) return;

    try {
        const user = auth.currentUser;
        if (user) {
            await sendEmailVerification(user);
            mostrarNotificacion("Correo de verificación reenviado.");
            iniciarContadorReenvio();
        }
    } catch (error) {
        mostrarNotificacion("Debes esperar un momento antes de solicitar otro.", "error");
    }
}

window.cerrarSesionVerificacion = async function() {
    await signOut(auth);
    location.reload();
}