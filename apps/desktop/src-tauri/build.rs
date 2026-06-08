fn watch_dir(dir: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                watch_dir(&path);
            } else {
                println!("cargo:rerun-if-changed={}", path.display());
            }
        }
    }
}

fn main() {
    // Bump when engine C++ changes to force cargo to re-run this build script.
    println!("cargo:rustc-env=FREEDECK_ENGINE_BUILD_ID=20250608h");

    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let engine_dir = manifest_dir.join("../../../engine");

    println!("cargo:rerun-if-changed={}", manifest_dir.join("build.rs").display());
    println!(
        "cargo:rerun-if-changed={}",
        engine_dir.join("CMakeLists.txt").display()
    );
    watch_dir(&engine_dir.join("src"));
    watch_dir(&engine_dir.join("include"));
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("cpp/engine_shim.cc").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("cpp/engine_shim.h").display()
    );

    let dst = cmake::Config::new(&engine_dir)
        .define("CMAKE_BUILD_TYPE", "Release")
        .build_target("freedeck_engine")
        .build();

    // CMake places the static lib in the build dir (install step may not copy on all generators).
    let lib_dir = if dst.join("lib").join("libfreedeck_engine.a").exists() {
        dst.join("lib")
    } else {
        dst.join("build")
    };
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=freedeck_engine");
    println!("cargo:rustc-link-lib=static=rubberband");

    #[cfg(target_os = "macos")]
    {
        for lib_name in ["libfreedeck_engine.a", "librubberband.a"] {
            let lib_path = lib_dir.join(lib_name);
            if lib_path.exists() {
                let status = std::process::Command::new("ranlib")
                    .arg("-c")
                    .arg(&lib_path)
                    .status()
                    .expect("failed to run ranlib");
                assert!(status.success(), "ranlib failed for {}", lib_path.display());
            }
        }
    }

    cxx_build::bridge("src/engine_bridge.rs")
        .file("cpp/engine_shim.cc")
        .include(manifest_dir.join("cpp"))
        .include(engine_dir.join("include"))
        .flag_if_supported("-std=c++17")
        .compile("freedeck_bridge");

  #[cfg(target_os = "macos")]
    {
        for framework in [
            "CoreAudio",
            "CoreMIDI",
            "AudioToolbox",
            "AudioUnit",
            "Accelerate",
            "CoreFoundation",
            "Foundation",
            "IOKit",
            "Security",
            "AppKit",
            "Carbon",
            "Cocoa",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }

    tauri_build::build();
}
