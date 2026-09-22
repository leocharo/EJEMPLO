import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged, reload } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

    if (modo === 'register') {
        if (nombreContainer) nombreContainer.classList.remove('hidden');
        if (usuarioContainer) usuarioContainer.classList.remove('hidden');
        if (document.getElementById('auth-nombre')) document.getElementById('auth-nombre').required = true;
        if (document.getElementById('auth-usuario')) document.getElementById('auth-usuario').required = true;
        if (titulo) titulo.innerText = "Crear Cuenta";
        if (subitulo) subtitulo.innerText = "Regístrate para compartir materiales educativos";
        if (btn) btn.innerText = "Registrarse";
        if (contenedorOlvido) contenedorOlvido.classList.add('hidden');
        if (textoAlternativo) {
            textoAlternativo.innerHTML = `¿Ya tienes cuenta? <button type="button" onclick="cambiarModoAuth('login')" class="font-semibold hover:underline" style="color:#2F6B4F;">Inicia sesión</button>`;
        }
    } else {
        if (nombreContainer) nombreContainer.classList.add('hidden');
        if (usuarioContainer) usuarioContainer.classList.add('hidden');
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

// FUNCIÓN CLAVE QUE FALTABA PARA PROCESAR EL INICIO DE SESIÓN Y REGISTRO
window.manejarAuthPagina = async function(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const nombre = document.getElementById('auth-nombre')?.value || "Usuario";
    const usuario = document.getElementById('auth-usuario')?.value || "usuario_generico";

    try {
        if (modoActual === 'register') {
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
            alert("¡Cuenta creada con éxito! Te hemos enviado un correo de confirmación (expira en 15 minutos).");
        } else {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            if (!userCredential.user.emailVerified) {
                alert("Por favor, verifica tu correo electrónico antes de ingresar.");
                return;
            }
            window.location.href = 'index.html';
        }
    } catch (error) {
        let mensajeAmigable = "Ocurrió un error inesperado. Inténtalo de nuevo.";

        switch (error.code) {
            case 'auth/email-already-in-use':
                mensajeAmigable = "Este correo electrónico ya está registrado. Inicia sesión o usa uno diferente.";
                break;
            case 'auth/invalid-email':
                mensajeAmigable = "El formato del correo electrónico no es válido.";
                break;
            case 'auth/weak-password':
                mensajeAmigable = "La contraseña debe tener al menos 6 caracteres.";
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                mensajeAmigable = "Correo o contraseña incorrectos. Verifica tus datos.";
                break;
            case 'auth/too-many-requests':
                mensajeAmigable = "Demasiados intentos fallidos. Por seguridad, espera un momento.";
                break;
        }

        alert(mensajeAmigable);
    }
}

window.recuperarContraseña = async function() {
    const emailInput = document.getElementById('auth-email').value;
    if (!emailInput) {
        alert("Por favor, escribe tu correo electrónico en el campo de arriba para recuperar tu contraseña.");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, emailInput);
        alert("Te hemos enviado un enlace para restablecer tu contraseña a tu correo. El enlace expirará en 15 minutos.");
    } catch (error) {
        alert("No se pudo enviar el correo de recuperación. Verifica que la dirección sea correcta.");
    }
}

window.verificarEstadoCuenta = async function() {
    const user = auth.currentUser;
    if (user) {
        await reload(user);
        if (user.emailVerified) {
            window.location.href = 'index.html';
        } else {
            alert("Verifica primero tu cuenta. Revisa tu bandeja de entrada o spam.");
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
            alert("Correo de verificación reenviado con éxito.");
            iniciarContadorReenvio();
        }
    } catch (error) {
        alert("Debes esperar un momento antes de solicitar otro correo.");
    }
}

window.cerrarSesionVerificacion = async function() {
    await signOut(auth);
    location.reload();
}