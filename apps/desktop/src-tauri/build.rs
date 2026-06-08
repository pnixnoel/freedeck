fn main() {
    let engine_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../engine");

    let dst = cmake::Config::new(&engine_dir)
        .define("CMAKE_BUILD_TYPE", "Release")
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

    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
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
